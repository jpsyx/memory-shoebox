import { expect, it } from "vitest";

import { uploadProcessingOutput } from "../../../src/mediaProcessing/output/uploadProcessingOutput.ts";

import { recoverProcessingOutputs } from "../../../src/mediaProcessing/output/recoverProcessingOutputs.ts";

import { runObjectDeletionDrain } from "../../../src/jobs/runObjectDeletionDrain.ts";

import { createMultipartOutputFixture } from "./multipartOutputTestHelpers.ts";

it("records upload ownership before parts and accepts a renewed DB lease with an old snapshot", async () => {
  const { upload, row, database, claim, b2 } =
    await createMultipartOutputFixture();
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
  const { upload, row, database, requests } =
    await createMultipartOutputFixture();
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
  const { database, b2, key, row, claim } =
    await createMultipartOutputFixture();
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
  const { database, b2, key, row } = await createMultipartOutputFixture();
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

it("fences a late ID persistence callback after recovery claims cleanup", async () => {
  const { b2, upload, database, row, claim } =
    await createMultipartOutputFixture();
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
  const { b2, database, row, key } = await createMultipartOutputFixture();
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
