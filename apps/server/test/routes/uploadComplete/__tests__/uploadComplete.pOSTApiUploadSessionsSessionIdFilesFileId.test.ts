import {
  JPEG,
  DISPLAY,
  THUMB,
  setUpUploadTestContext,
} from "./uploadCompleteTestHelpers.ts";

import { describe, expect, it } from "vitest";
import type { CompleteUploadFileResponse } from "@memory-shoebox/shared";

import { NOW } from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/complete", () => {
  it("lands a file whose original and derivatives are all in the bucket", async () => {
    const { b2, database, sessionId, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
    const landing = await seedFile({ position: 1 });
    // Still in flight, so this complete does not settle the batch.
    await seedFile({ position: 2 });
    b2.storedObjects.set(landing.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    b2.storedObjects.set(landing.keyOf("display"), {
      sizeBytes: 200_000,
      contentType: JPEG,
    });
    b2.storedObjects.set(landing.keyOf("thumb"), {
      sizeBytes: 40_000,
      contentType: JPEG,
    });

    const response = await complete({
      fileId: landing.fileId,
      payload: {
        outcome: "done",
        contentHash: landing.contentHash,
        byteSize: 1024,
        width: 3024,
        height: 4032,
        renditions: [DISPLAY, THUMB],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<CompleteUploadFileResponse>();
    expect(body).toMatchObject({
      didSettle: false,
      sessionState: "uploading",
      file: { fileId: landing.fileId, state: "done" },
      progress: { doneCount: 1, sendingCount: 1, doneBytes: 1024 },
    });
    expect(body.file.media).not.toBeNull();
    const row = await readFile(landing.fileId);
    expect(row).toMatchObject({
      state: "done",
      width: 3024,
      height: 4032,
      presigned_until: null,
      item_id: body.file.itemId,
    });
    const renditions = await database
      .selectFrom("item_renditions")
      .select("purpose")
      .where("item_id", "=", row.item_id ?? "")
      .orderBy("purpose", "asc")
      .execute();
    expect(
      renditions.map((rendition) => {
        return rendition.purpose;
      }),
    ).toEqual(["display", "original", "thumb"]);
    const session = await database
      .selectFrom("upload_sessions")
      .select("last_activity_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_activity_at).toBe(NOW);
    await close();
  });

  it("queues the derivative keys a done file did not report, and only those", async () => {
    const { b2, database, seedFile, complete, close } =
      await setUpUploadTestContext();
    const landing = await seedFile({ position: 1 });
    await seedFile({ position: 2 });
    b2.storedObjects.set(landing.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    b2.storedObjects.set(landing.keyOf("display"), {
      sizeBytes: 200_000,
      contentType: JPEG,
    });

    // A thumb PUT that landed and was then dropped is never reported.
    const response = await complete({
      fileId: landing.fileId,
      payload: {
        outcome: "done",
        contentHash: landing.contentHash,
        byteSize: 1024,
        width: 3024,
        height: 4032,
        renditions: [DISPLAY],
      },
    });

    expect(response.statusCode).toBe(200);
    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .orderBy("storage_key")
      .execute();
    const posterKey = landing.keyOf("display").replace("display", "poster");
    expect(
      queued.map((row) => {
        return row.storage_key;
      }),
    ).toEqual([posterKey, landing.keyOf("thumb")].sort());
    await close();
  });

  it("settles on the last terminal file, and tells only that caller", async () => {
    const { b2, seedFile, complete, close } = await setUpUploadTestContext();
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    b2.storedObjects.set(first.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });

    const landed = await complete({
      fileId: first.fileId,
      payload: {
        outcome: "done",
        contentHash: first.contentHash,
        byteSize: 1024,
      },
    });
    const dropped = await complete({
      fileId: second.fileId,
      payload: {
        outcome: "failed",
        problemCode: "connection_lost",
        problemDetail: "The network went away.",
      },
    });

    expect(landed.json<CompleteUploadFileResponse>().didSettle).toBe(false);
    expect(dropped.json<CompleteUploadFileResponse>()).toMatchObject({
      didSettle: true,
      sessionState: "settled",
      file: { state: "failed", problemCode: "connection_lost" },
      progress: { doneCount: 1, failedCount: 1 },
    });
    await close();
  });

  it("is not done until every rendition it reports is in the bucket", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
    const file = await seedFile({ position: 1 });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    b2.storedObjects.set(file.keyOf("display"), {
      sizeBytes: 200_000,
      contentType: JPEG,
    });
    // The thumb was reported and never arrived.

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
        renditions: [DISPLAY, THUMB],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "upload_file_conflict",
      details: { state: "failed" },
    });
    expect(await readFile(file.fileId)).toMatchObject({
      state: "failed",
      problem_code: "content_mismatch",
      item_id: null,
    });
    expect(await countItems()).toBe(0);
    await close();
  });

  it("fails bytes that are not the ones presigned, without asking Backblaze", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
    const file = await seedFile({ position: 1 });

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: "f".repeat(64),
        byteSize: 1024,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_file_conflict");
    expect(await readFile(file.fileId)).toMatchObject({
      state: "failed",
      problem_code: "checksum_mismatch",
    });
    expect(b2.calls).toEqual([]);
    expect(await countItems()).toBe(0);
    await close();
  });

  it("fails as content_mismatch when the bucket holds a different size", async () => {
    const { b2, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
    const file = await seedFile({ position: 1 });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 999,
      contentType: JPEG,
    });

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
      },
    });

    expect(response.statusCode).toBe(409);
    expect((await readFile(file.fileId)).problem_code).toBe("content_mismatch");
    await close();
  });

  it("answers 503 and leaves the row sending when Backblaze is down, then lands", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
    const file = await seedFile({ position: 1 });
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    };
    b2.isUnavailable = true;

    const unavailable = await complete({
      fileId: file.fileId,
      payload: payload,
    });

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error).toBe("upload_storage_unavailable");
    expect((await readFile(file.fileId)).state).toBe("sending");
    expect(await countItems()).toBe(0);

    b2.isUnavailable = false;
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    const landed = await complete({ fileId: file.fileId, payload: payload });
    expect(landed.statusCode).toBe(200);
    expect(await countItems()).toBe(1);
    await close();
  });
});
