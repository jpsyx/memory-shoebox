import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, it, onTestFinished } from "vitest";
import { createFakeS3Server } from "../../../../e2e/support/createFakeS3Server/createFakeS3Server.ts";
import { createB2Client } from "../../src/b2/createB2Client/createB2Client.ts";
import { createTestConfig } from "../helpers/createTestConfig.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createMediaProcessingQueue } from "../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";
import { uploadProcessingOutput } from "../../src/mediaProcessing/output/uploadProcessingOutput.ts";
import { recoverProcessingOutputs } from "../../src/mediaProcessing/output/recoverProcessingOutputs.ts";
import { runObjectDeletionDrain } from "../../src/jobs/runObjectDeletionDrain.ts";
import {
  insertMember,
  insertItem,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";

const MIB = 1024 ** 2;
async function _storage() {
  const server = createFakeS3Server({
    bucketName: "memory-shoebox-media",
    allowedOrigins: [],
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const b2 = createB2Client(createTestConfig({ B2_ENDPOINT: endpoint }).b2);
  return {
    b2,
    requests: async () => {
      const response = await fetch(`${endpoint}/__fake-s3/requests`);
      return (
        (await response.json()) as {
          requests: Array<{
            operation: string;
            key: string;
            byteLength: number;
          }>;
        }
      ).requests;
    },
  };
}
async function* _body(size: number) {
  yield Buffer.alloc(size, 3);
}
async function _fixture() {
  const directory = await mkdtemp(join(tmpdir(), "processing-output-"));
  const databasePath = join(directory, "catalog.db");
  const database = createDatabase(databasePath);
  onTestFinished(async () => {
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceRenditionId = await insertRendition(database, {
    itemId,
    purpose: "original",
  });
  const queue = createMediaProcessingQueue({
    database,
    clock: () => {
      return new Date();
    },
  });
  await queue.enqueue({
    itemId,
    sourceRenditionId,
    recipe: "photo-v1",
    priority: 0,
  });
  const claim = (await queue.claim())!;
  const outputId = "output-1";
  const key = `processing/${claim.attemptToken}/display.jpg`;
  await database
    .insertInto("media_processing_outputs")
    .values({
      id: outputId,
      job_id: claim.jobId,
      item_id: itemId,
      attempt_token: claim.attemptToken,
      storage_key: key,
      purpose: "display",
      state: "reserved",
      multipart_upload_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .execute();
  const path = join(directory, "display.jpg");
  await writeFile(path, Buffer.alloc(1024));
  const storage = await _storage();
  const upload = {
    database,
    b2: storage.b2,
    claim,
    outputId,
    path,
    contentType: "image/jpeg",
    byteSize: 1024,
    signal: new AbortController().signal,
  };
  const row = () => {
    return database
      .selectFrom("media_processing_outputs")
      .selectAll()
      .where("id", "=", outputId)
      .executeTakeFirstOrThrow();
  };
  return {
    ...storage,
    database,
    databasePath,
    queue,
    claim,
    outputId,
    key,
    upload,
    row,
  };
}

it("persists multipart ID before first part and streams single eight MiB parts", async () => {
  const { b2, requests } = await _storage();
  expect(b2.putObjectStream).toBeTypeOf("function");
  const events: string[] = [];
  await b2.putObjectStream({
    key: "processing/output",
    body: _body(17 * MIB),
    contentType: "video/mp4",
    byteSize: 17 * MIB,
    signal: new AbortController().signal,
    onMultipartStarted: async (uploadId) => {
      expect(uploadId).not.toBe("");
      expect(
        (await requests()).map((request) => {
          return request.operation;
        }),
      ).toEqual(["CreateMultipartUpload"]);
      events.push("persisted");
    },
  });
  expect(events).toEqual(["persisted"]);
  const parts = (await requests()).filter((request) => {
    return request.operation === "UploadPart";
  });
  expect(
    parts.map((part) => {
      return part.byteLength;
    }),
  ).toEqual([8 * MIB, 8 * MIB, MIB]);
  expect(await b2.headObject({ key: "processing/output" })).toMatchObject({
    sizeBytes: 17 * MIB,
  });
});

it("aborts before parts when persistence fails", async () => {
  const { b2, requests } = await _storage();
  expect(b2.putObjectStream).toBeTypeOf("function");
  await expect(
    b2.putObjectStream({
      key: "processing/output",
      body: _body(1),
      contentType: "image/jpeg",
      byteSize: 1,
      signal: new AbortController().signal,
      onMultipartStarted: async () => {
        throw new Error("disk failure");
      },
    }),
  ).rejects.toThrow("disk failure");
  expect(
    (await requests()).map((request) => {
      return request.operation;
    }),
  ).toEqual(["CreateMultipartUpload", "AbortMultipartUpload"]);
});

it.each([1023, 1025])(
  "aborts stream size mismatch %s and never publishes it",
  async (byteSize) => {
    const { b2, requests } = await _storage();
    expect(b2.putObjectStream).toBeTypeOf("function");
    await expect(
      b2.putObjectStream({
        key: "processing/output",
        body: _body(1024),
        contentType: "image/jpeg",
        byteSize,
        signal: new AbortController().signal,
        onMultipartStarted: async () => {},
      }),
    ).rejects.toThrow(/size/i);
    expect((await requests()).at(-1)?.operation).toBe("AbortMultipartUpload");
    expect(await b2.headObject({ key: "processing/output" })).toBeUndefined();
  },
);

it("records upload ownership before parts and accepts a renewed DB lease with an old snapshot", async () => {
  const { upload, row, database, claim, b2 } = await _fixture();
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: new Date(Date.now() + 120_000).toISOString() })
    .where("id", "=", claim.jobId)
    .execute();
  await uploadProcessingOutput({
    ...upload,
    claim: { ...claim, leaseExpiresAt: "2000-01-01T00:00:00.000Z" },
  });
  expect(await row()).toMatchObject({
    state: "uploaded",
    multipart_upload_id: expect.any(String),
  });
  expect(await b2.headObject({ key: (await row()).storage_key })).toMatchObject(
    { sizeBytes: 1024 },
  );
});

it("rejects missing, expired, forged and cleanup-owned reservations before storage", async () => {
  const { upload, row, database, requests } = await _fixture();
  for (const state of ["cleanup", "published", "uploaded"] as const) {
    await database
      .updateTable("media_processing_outputs")
      .set({ state })
      .where("id", "=", upload.outputId)
      .execute();
    await expect(uploadProcessingOutput(upload)).rejects.toThrow(/ownership/i);
  }
  await database
    .updateTable("media_processing_outputs")
    .set({ state: "reserved" })
    .where("id", "=", upload.outputId)
    .execute();
  await expect(
    uploadProcessingOutput({
      ...upload,
      claim: { ...upload.claim, attemptToken: "forged" },
    }),
  ).rejects.toThrow(/ownership/i);
  await database
    .updateTable("media_processing_jobs")
    .set({ lease_expires_at: "2000-01-01T00:00:00.000Z" })
    .execute();
  await expect(uploadProcessingOutput(upload)).rejects.toThrow(/ownership/i);
  expect((await row()).state).toBe("reserved");
  expect(await requests()).toEqual([]);
});

it("recovers initiation before ID persistence and keeps cleanup tombstones for late completion", async () => {
  const { database, b2, key, row, claim } = await _fixture();
  const opened = await b2.presignMultipart({
    key,
    contentType: "image/jpeg",
    partCount: 1,
  });
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
  expect((await row()).state).toBe("cleanup");
  expect(b2.listMultipartUploadsForKey).toBeTypeOf("function");
  expect(await Array.fromAsync(b2.listMultipartUploadsForKey(key))).toEqual([]);
  expect(
    (await fetch(opened.partUrls[0]!, { method: "PUT", body: "orphan" }))
      .status,
  ).toBe(404);
  const now = new Date();
  await runObjectDeletionDrain({ database, b2, now: now.toISOString() });
  expect(
    await database
      .selectFrom("pending_object_deletions")
      .selectAll()
      .where("storage_key", "=", key)
      .execute(),
  ).toHaveLength(1);
  await b2.putObject({
    key,
    body: Buffer.from("late"),
    contentType: "image/jpeg",
  });
  await runObjectDeletionDrain({
    database,
    b2,
    now: new Date(now.getTime() + 2 * 24 * 3600_000).toISOString(),
  });
  expect(await b2.headObject({ key })).toBeUndefined();
});

it("protects every active output state from both recovery and generic deletion", async () => {
  const { database, b2, key, row } = await _fixture();
  await b2.putObject({
    key,
    body: Buffer.from("keep"),
    contentType: "image/jpeg",
  });
  for (const state of ["reserved", "uploading", "uploaded"] as const) {
    await database
      .updateTable("media_processing_outputs")
      .set({ state })
      .execute();
    await database
      .insertInto("pending_object_deletions")
      .values({
        id: state,
        storage_key: key,
        created_at: new Date().toISOString(),
        attempts: 0,
      })
      .execute();
    await recoverProcessingOutputs({
      database,
      b2,
      now: new Date().toISOString(),
    });
    await runObjectDeletionDrain({
      database,
      b2,
      now: new Date().toISOString(),
    });
    expect((await row()).state).toBe(state);
    expect(await b2.headObject({ key })).toMatchObject({ sizeBytes: 4 });
  }
});

it("does not consume the next part until the previous upload completes", async () => {
  const { b2, requests } = await _storage();
  const body = async function* () {
    yield Buffer.alloc(8 * MIB);
    expect(
      (await requests()).map((request) => {
        return request.operation;
      }),
    ).toEqual(["CreateMultipartUpload", "UploadPart"]);
    yield Buffer.alloc(1);
  };
  await b2.putObjectStream({
    key: "output",
    body: body(),
    byteSize: 8 * MIB + 1,
    contentType: "image/jpeg",
    signal: new AbortController().signal,
    onMultipartStarted: async () => {},
  });
});

it("persists the actual ID in SQLite before reading any output bytes", async () => {
  const { b2, upload, row } = await _fixture();
  const putObjectStream = b2.putObjectStream;
  b2.putObjectStream = async (options) => {
    const body = async function* () {
      expect(await row()).toMatchObject({
        state: "uploading",
        multipart_upload_id: expect.any(String),
      });
      yield* options.body;
    };
    return putObjectStream({ ...options, body: body() });
  };
  await uploadProcessingOutput(upload);
  expect((await row()).state).toBe("uploaded");
});

it("aborts a missing local output without an unhandled stream error", async () => {
  const { upload, requests, b2 } = await _fixture();
  const putObjectStream = b2.putObjectStream;
  b2.putObjectStream = async (options) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    return putObjectStream(options);
  };
  await expect(
    uploadProcessingOutput({ ...upload, path: `${upload.path}.missing` }),
  ).rejects.toThrow();
  expect((await requests()).at(-1)?.operation).toBe("AbortMultipartUpload");
});

it("fences a late ID persistence callback after recovery claims cleanup", async () => {
  const { b2, upload, database, row, claim } = await _fixture();
  const started = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const putObjectStream = b2.putObjectStream;
  b2.putObjectStream = (options) => {
    return putObjectStream({
      ...options,
      onMultipartStarted: async (uploadId) => {
        started.resolve();
        await resume.promise;
        await options.onMultipartStarted(uploadId);
      },
    });
  };
  const uploading = uploadProcessingOutput(upload);
  const rejection = expect(uploading).rejects.toThrow(/ownership/i);
  await started.promise;
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
  resume.resolve();
  await rejection;
  expect((await row()).state).toBe("cleanup");
  expect(
    await b2.headObject({ key: (await row()).storage_key }),
  ).toBeUndefined();
});

it("rechecks cleanup keys for an initiation arriving after the first empty listing", async () => {
  const { b2, database, row, key } = await _fixture();
  const now = new Date();
  await database.deleteFrom("items").execute();
  await recoverProcessingOutputs({ database, b2, now: now.toISOString() });
  expect((await row()).state).toBe("cleanup");
  await b2.presignMultipart({ key, contentType: "image/jpeg", partCount: 1 });
  expect(
    await Array.fromAsync(b2.listMultipartUploadsForKey(key)),
  ).toHaveLength(1);
  await recoverProcessingOutputs({
    database,
    b2,
    now: new Date(now.getTime() + 2 * 24 * 3600_000).toISOString(),
  });
  expect(await Array.fromAsync(b2.listMultipartUploadsForKey(key))).toEqual([]);
});

it("never restores uploaded state after cleanup claims an uncertain completed output", async () => {
  const { b2, database, upload, row, claim, key } = await _fixture();
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
    await import("../b2/client/__tests__/clientTestHelpers.ts");
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
    await import("../b2/client/__tests__/clientTestHelpers.ts");
  const stub = await startStubBucket({
    answer: () => {
      return { status: 500, body: "<Error><Code>InternalError</Code></Error>" };
    },
  });
  onTestFinished(stub.close);
  await expect(
    stub.client.putObjectStream({
      key: "output",
      body: _body(1),
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
  const { databasePath, b2, database, queue, claim, row } = await _fixture();
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
  const { database, upload, key } = await _fixture();
  const { createFakeB2Client } =
    await import("../helpers/createFakeB2Client/createFakeB2Client.ts");
  const { failB2CallsInsideTransactions } =
    await import("../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts");
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

it("aborts a cancelled stream before another part or completion", async () => {
  const { b2, requests } = await _storage();
  const controller = new AbortController();
  const body = async function* () {
    yield Buffer.alloc(8 * MIB);
    controller.abort();
    yield Buffer.alloc(1);
  };
  await expect(
    b2.putObjectStream({
      key: "output",
      body: body(),
      byteSize: 8 * MIB + 1,
      contentType: "video/mp4",
      signal: controller.signal,
      onMultipartStarted: async () => {},
    }),
  ).rejects.toThrow();
  expect(
    (await requests()).map((request) => {
      return request.operation;
    }),
  ).toEqual(["CreateMultipartUpload", "UploadPart", "AbortMultipartUpload"]);
});

it("caps declared output size before initiation and aborts provider part failures", async () => {
  const { startStubBucket, INITIATE_XML } =
    await import("../b2/client/__tests__/clientTestHelpers.ts");
  const stub = await startStubBucket({
    answer: (request) => {
      return request.method === "POST"
        ? { status: 200, body: INITIATE_XML }
        : request.method === "DELETE"
          ? { status: 204 }
          : { status: 500, body: "<Error><Code>InternalError</Code></Error>" };
    },
  });
  onTestFinished(stub.close);
  const options = {
    key: "output",
    body: _body(1),
    byteSize: 512 * MIB + 1,
    contentType: "image/jpeg",
    signal: new AbortController().signal,
    onMultipartStarted: async () => {},
  };
  await expect(stub.client.putObjectStream(options)).rejects.toThrow(/size/);
  expect(stub.requests).toEqual([]);
  await expect(
    stub.client.putObjectStream({ ...options, byteSize: 1 }),
  ).rejects.toThrow();
  expect(
    stub.requests.map((request) => {
      return request.method;
    }),
  ).toEqual(["POST", "PUT", "DELETE"]);
});

it("advances beyond one hundred failed cleanup rows and retries them after the cadence", async () => {
  const { database, claim, row } = await _fixture();
  const { createFakeB2Client } =
    await import("../helpers/createFakeB2Client/createFakeB2Client.ts");
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
