import { expect, it, onTestFinished } from "vitest";

import { createDatabase } from "../../../src/db/client.ts";

import { uploadProcessingOutput } from "../../../src/mediaProcessing/output/uploadProcessingOutput.ts";

import { recoverProcessingOutputs } from "../../../src/mediaProcessing/output/recoverProcessingOutputs.ts";

import { runObjectDeletionDrain } from "../../../src/jobs/runObjectDeletionDrain.ts";

import {
  makeBodyFromSize,
  createMultipartOutputFixture,
} from "./multipartOutputTestHelpers.ts";

it("never restores uploaded state after cleanup claims an uncertain completed output", async () => {
  const { b2, database, upload, row, claim, key } =
    await createMultipartOutputFixture();
  const completed = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const putObjectStream = b2.putObjectStream;
  b2.putObjectStream = async (options) => {
    await putObjectStream(options);
    completed.resolve();
    await resume.promise;
  };
  const uploading = uploadProcessingOutput(upload);
  const rejection = expect(uploading).rejects.toThrow(/ownership/i);
  await completed.promise;
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: "2000-01-01T00:00:00.000Z" })
    .where("id", "=", claim.jobId)
    .execute();
  await recoverProcessingOutputs({
    database,
    b2,
    now: new Date().toISOString(),
  });
  // Even renewed-looking job ownership cannot reclaim the cleanup-owned output.
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: new Date(Date.now() + 120_000).toISOString() })
    .where("id", "=", claim.jobId)
    .execute();
  resume.resolve();
  await rejection;
  expect((await row()).state).toBe("cleanup");
  await runObjectDeletionDrain({ database, b2, now: new Date().toISOString() });
  expect(await b2.headObject({ key })).toBeUndefined();
});

it("filters exact keys and carries both multipart pagination markers", async () => {
  const { startStubBucket } =
    await import("../../b2/client/__tests__/clientTestHelpers.ts");
  const stub = await startStubBucket({
    answer: (request) => {
      const query = new URL(request.url, "http://local").searchParams;
      expect(query.get("prefix")).toBe("test/output");
      const isSecond = query.get("upload-id-marker") === "first";
      if (isSecond) {
        expect(query.get("key-marker")).toBe("test/output");
      }
      return {
        status: 200,
        body: `<ListMultipartUploadsResult><IsTruncated>${!isSecond}</IsTruncated>${isSecond ? "" : "<NextKeyMarker>test/output</NextKeyMarker><NextUploadIdMarker>first</NextUploadIdMarker>"}<Upload><Key>test/output</Key><UploadId>${isSecond ? "second" : "first"}</UploadId></Upload><Upload><Key>test/output-other</Key><UploadId>sibling</UploadId></Upload><Upload><Key>production/output</Key><UploadId>foreign</UploadId></Upload></ListMultipartUploadsResult>`,
      };
    },
  });
  onTestFinished(stub.close);
  expect(
    await Array.fromAsync(stub.client.listMultipartUploadsForKey("output")),
  ).toEqual([{ uploadId: "first" }, { uploadId: "second" }]);
  expect(stub.requests).toHaveLength(2);
});

it("does not retry an ambiguous initiation response", async () => {
  const { startStubBucket } =
    await import("../../b2/client/__tests__/clientTestHelpers.ts");
  const stub = await startStubBucket({
    answer: () => {
      return { status: 500, body: "<Error><Code>InternalError</Code></Error>" };
    },
  });
  onTestFinished(stub.close);
  await expect(
    stub.client.putObjectStream({
      key: "output",
      body: makeBodyFromSize(1),
      byteSize: 1,
      contentType: "image/jpeg",
      signal: new AbortController().signal,
      onMultipartStarted: async () => {
        throw new Error("must not reach callback");
      },
    }),
  ).rejects.toThrow();
  expect(stub.requests).toHaveLength(1);
});

it("keeps local output recovery and queue transitions responsive across database handles", async () => {
  const { databasePath, b2, database, queue, claim, row } =
    await createMultipartOutputFixture();
  const second = createDatabase(databasePath);
  onTestFinished(async () => {
    await second.destroy();
  });
  const start = performance.now();
  const heartbeat = new Promise<number>((resolve) => {
    setTimeout(() => {
      resolve(performance.now() - start);
    }, 0);
  });
  const results = await Promise.allSettled([
    recoverProcessingOutputs({
      database: second,
      b2,
      now: new Date().toISOString(),
    }),
    queue.renew(claim),
  ]);
  expect(await heartbeat).toBeLessThan(1000);
  expect(
    results.map((result) => {
      return result.status;
    }),
  ).toEqual(["fulfilled", "fulfilled"]);
  expect((await row()).state).toBe("reserved");
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: "2000-01-01T00:00:00.000Z" })
    .execute();
  const expiredResults = await Promise.allSettled([
    recoverProcessingOutputs({
      database: second,
      b2,
      now: new Date().toISOString(),
    }),
    queue.renew(claim),
  ]);
  expect(
    expiredResults.map((result) => {
      return result.status;
    }),
  ).toEqual(["fulfilled", "fulfilled"]);
  expect((await row()).state).toBe("cleanup");
}, 15_000);

it("keeps upload, recovery and deletion storage calls outside SQL transactions", async () => {
  const { database, upload, key } = await createMultipartOutputFixture();
  const { createFakeB2Client } =
    await import("../../helpers/createFakeB2Client/createFakeB2Client.ts");
  const { failB2CallsInsideTransactions } =
    await import("../../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts");
  const b2 = createFakeB2Client();
  const watched = failB2CallsInsideTransactions({ database, b2 });
  await uploadProcessingOutput({ ...upload, database: watched.database, b2 });
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: "2000-01-01T00:00:00.000Z" })
    .execute();
  await recoverProcessingOutputs({
    database: watched.database,
    b2,
    now: new Date().toISOString(),
  });
  await runObjectDeletionDrain({
    database: watched.database,
    b2,
    now: new Date().toISOString(),
  });
  expect(watched.callsInsideTransactions).toEqual([]);
  expect(b2.deletedKeys).toContain(key);
});

it("advances beyond one hundred failed cleanup rows and retries them after the cadence", async () => {
  const { database, claim, row } = await createMultipartOutputFixture();
  const { createFakeB2Client } =
    await import("../../helpers/createFakeB2Client/createFakeB2Client.ts");
  const b2 = createFakeB2Client();
  const attempts = new Map<string, number>();
  const listMultipartUploadsForKey = b2.listMultipartUploadsForKey;
  b2.listMultipartUploadsForKey = async function* (key) {
    attempts.set(key, (attempts.get(key) ?? 0) + 1);
    if (key.startsWith("blocked/")) {
      throw new Error("permanent local storage failure");
    }
    yield* listMultipartUploadsForKey(key);
  };
  const now = new Date();
  const old = new Date(now.getTime() - 3 * 24 * 3600_000).toISOString();
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: old })
    .execute();
  await database
    .insertInto("media_processing_outputs")
    .values(
      Array.from({ length: 100 }, (_unused, index) => {
        return {
          id: `blocked-output-${index}`,
          job_id: claim.jobId,
          item_id: claim.itemId,
          attempt_token: claim.attemptToken,
          storage_key: `blocked/${index}`,
          purpose: "display",
          state: "reserved" as const,
          multipart_upload_id: null,
          created_at: old,
          updated_at: old,
        };
      }),
    )
    .execute();
  await recoverProcessingOutputs({ database, b2, now: now.toISOString() });
  expect((await row()).state).toBe("reserved");
  await recoverProcessingOutputs({ database, b2, now: now.toISOString() });
  expect((await row()).state).toBe("cleanup");
  expect(attempts.get("blocked/0")).toBe(1);
  await recoverProcessingOutputs({
    database,
    b2,
    now: new Date(now.getTime() + 23 * 3600_000).toISOString(),
  });
  expect(attempts.get("blocked/0")).toBe(1);
  await recoverProcessingOutputs({
    database,
    b2,
    now: new Date(now.getTime() + 24 * 3600_000).toISOString(),
  });
  expect(attempts.get("blocked/0")).toBe(2);
  expect(
    await database
      .selectFrom("pending_object_deletions")
      .select("id")
      .execute(),
  ).toHaveLength(101);
});
