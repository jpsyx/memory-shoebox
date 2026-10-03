import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import type {
  CompleteUploadFileResponse,
  RenditionPurpose,
} from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { makeUploadStorageKeyFromRendition } from "../../src/upload/presignUploadFile.ts";
import {
  createFakeB2Client,
  type FakeB2Client,
} from "../helpers/createFakeB2Client.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { failB2CallsInsideTransactions } from "../helpers/failB2CallsInsideTransactions.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const JPEG = "image/jpeg";
const DISPLAY = {
  purpose: "display",
  byteSize: 200_000,
  width: 1536,
  height: 2048,
};
const THUMB = { purpose: "thumb", byteSize: 40_000, width: 360, height: 480 };

/**
 * A gate two callers must both reach before either passes, so two completes of
 * one file are both past their verification before either writes. A short
 * timer frees them if the second never comes, so a regression fails rather
 * than hangs.
 */
const makeGateForTwoCallers = (): (() => Promise<void>) => {
  let arrivedCount = 0;
  let release = (): void => {};
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, 250);
  });
  return async () => {
    arrivedCount += 1;
    if (arrivedCount === 2) {
      release();
    }
    await bothArrived;
  };
};

/** Holds every `headObject` until two have been asked. */
const holdHeadObjectsUntilTwoAreAsked = (b2: FakeB2Client): void => {
  const passGate = makeGateForTwoCallers();
  const headObject = b2.headObject;
  b2.headObject = async (options) => {
    await passGate();
    return headObject(options);
  };
};

/** Holds every `completeMultipart` until two have been asked. */
const holdCompleteMultipartsUntilTwoAreAsked = (b2: FakeB2Client): void => {
  const passGate = makeGateForTwoCallers();
  const completeMultipart = b2.completeMultipart;
  b2.completeMultipart = async (options) => {
    await passGate();
    return completeMultipart(options);
  };
};

/**
 * Rewrites the file's row at the start of the named Backblaze operation, which
 * is what a sweep, a commit-close or a re-presign does to a row while a
 * `complete` is verifying it. The fake's `onCall` is synchronous and cannot
 * wait for a write, so the write rides on the operation itself instead.
 */
const changeRowDuringVerification = (options: {
  b2: FakeB2Client;
  database: Kysely<Database>;
  operation: "headObject" | "completeMultipart";
  fileId: string;
  changes: Partial<Database["upload_files"]>;
}): void => {
  const { b2, database } = options;
  const rewriteRow = async (): Promise<void> => {
    await database
      .updateTable("upload_files")
      .set(options.changes)
      .where("id", "=", options.fileId)
      .execute();
  };
  if (options.operation === "headObject") {
    const headObject = b2.headObject;
    b2.headObject = async (callOptions) => {
      await rewriteRow();
      return headObject(callOptions);
    };
    return;
  }
  const completeMultipart = b2.completeMultipart;
  b2.completeMultipart = async (callOptions) => {
    await rewriteRow();
    return completeMultipart(callOptions);
  };
};

const setUp = async (
  options: {
    database?: Kysely<Database>;
    b2?: FakeB2Client;
    session?: Partial<Database["upload_sessions"]>;
  } = {},
) => {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
    // Only when given: a `database: undefined` would reach `createApp`.
    ...(options.database === undefined ? {} : { database: options.database }),
    ...(options.b2 === undefined ? {} : { b2: options.b2 }),
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    file_count: 2,
    total_bytes: 2048,
    last_activity_at: shiftMinutes({ instant: NOW, minutes: -10 }),
    ...options.session,
  });
  const seedFile = async (fileOptions: {
    position: number;
    multipartUploadId?: string;
    overrides?: Partial<Database["upload_files"]>;
  }) => {
    const fileId = createId();
    const contentHash = createHash("sha256").update(fileId).digest("hex");
    const keyOf = (purpose: "original" | "display" | "thumb") => {
      return makeUploadStorageKeyFromRendition({
        sessionId,
        fileId,
        purpose,
        declaredContentType: JPEG,
      });
    };
    await insertUploadFile(testApp.database, {
      id: fileId,
      uploadSessionId: sessionId,
      position: fileOptions.position,
      state: "sending",
      declared_bytes: 1024,
      content_hash: contentHash,
      storage_key: keyOf("original"),
      multipart_upload_id: fileOptions.multipartUploadId ?? null,
      captured_at: "2026-09-14T04:41:32.000Z",
      capture_date: "2026-09-14",
      capture_offset_minutes: 120,
      capture_source: "exif",
      original_captured_at: "2026-09-14T04:41:32.000Z",
      width: 4032,
      height: 3024,
      ...fileOptions.overrides,
    });
    return { fileId, contentHash, keyOf };
  };
  const complete = (fileId: string, payload: Record<string, unknown>) => {
    return testApp.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${fileId}/complete`,
      headers: { cookie },
      payload,
    });
  };
  const readFile = (fileId: string) => {
    return testApp.database
      .selectFrom("upload_files")
      .selectAll()
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
  };
  const countItems = async () => {
    return (await testApp.database.selectFrom("items").select("id").execute())
      .length;
  };
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    seedFile,
    complete,
    readFile,
    countItems,
  };
};

describe("POST /api/upload-sessions/:sessionId/files/:fileId/complete", () => {
  it("lands a file whose original and derivatives are all in the bucket", async () => {
    const { b2, database, sessionId, seedFile, complete, readFile, close } =
      await setUp();
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

    const response = await complete(landing.fileId, {
      outcome: "done",
      contentHash: landing.contentHash,
      byteSize: 1024,
      width: 3024,
      height: 4032,
      renditions: [DISPLAY, THUMB],
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

  it("settles on the last terminal file, and tells only that caller", async () => {
    const { b2, seedFile, complete, close } = await setUp();
    const first = await seedFile({ position: 1 });
    const second = await seedFile({ position: 2 });
    b2.storedObjects.set(first.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });

    const landed = await complete(first.fileId, {
      outcome: "done",
      contentHash: first.contentHash,
      byteSize: 1024,
    });
    const dropped = await complete(second.fileId, {
      outcome: "failed",
      problemCode: "connection_lost",
      problemDetail: "The network went away.",
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
      await setUp();
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

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      renditions: [DISPLAY, THUMB],
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
      await setUp();
    const file = await seedFile({ position: 1 });

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: "f".repeat(64),
      byteSize: 1024,
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
    const { b2, seedFile, complete, readFile, close } = await setUp();
    const file = await seedFile({ position: 1 });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 999,
      contentType: JPEG,
    });

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    });

    expect(response.statusCode).toBe(409);
    expect((await readFile(file.fileId)).problem_code).toBe("content_mismatch");
    await close();
  });

  it("answers 503 and leaves the row sending when Backblaze is down, then lands", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const file = await seedFile({ position: 1 });
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    };
    b2.isUnavailable = true;

    const unavailable = await complete(file.fileId, payload);

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error).toBe("upload_storage_unavailable");
    expect((await readFile(file.fileId)).state).toBe("sending");
    expect(await countItems()).toBe(0);

    b2.isUnavailable = false;
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    const landed = await complete(file.fileId, payload);
    expect(landed.statusCode).toBe(200);
    expect(await countItems()).toBe(1);
    await close();
  });

  it("repeats a done call idempotently, and refuses every other repeat", async () => {
    const { b2, seedFile, complete, countItems, close } = await setUp();
    const landedFile = await seedFile({ position: 1 });
    const failedFile = await seedFile({
      position: 2,
      overrides: { state: "failed", problem_code: "connection_lost" },
    });
    const waitingFile = await seedFile({
      position: 3,
      overrides: { state: "waiting", content_hash: null, storage_key: null },
    });
    b2.storedObjects.set(landedFile.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    const done = (file: { contentHash: string }) => {
      return { outcome: "done", contentHash: file.contentHash, byteSize: 1024 };
    };

    const first = await complete(landedFile.fileId, done(landedFile));
    const again = await complete(landedFile.fileId, done(landedFile));
    const failingADone = await complete(landedFile.fileId, {
      outcome: "failed",
      problemCode: "connection_lost",
    });
    const landingAFailed = await complete(failedFile.fileId, done(failedFile));
    const landingAWaiting = await complete(
      waitingFile.fileId,
      done(waitingFile),
    );

    expect(first.statusCode).toBe(200);
    expect(again.statusCode).toBe(200);
    expect(again.json<CompleteUploadFileResponse>()).toMatchObject({
      didSettle: false,
      file: { state: "done" },
    });
    expect(await countItems()).toBe(1);
    expect(
      [failingADone, landingAFailed, landingAWaiting].map((response) => {
        return [response.statusCode, response.json().details?.state];
      }),
    ).toEqual([
      [409, "done"],
      [409, "failed"],
      [409, "waiting"],
    ]);
    await close();
  });

  it("completes a multipart original with the browser's ETags", async () => {
    const { b2, seedFile, complete, readFile, close } = await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });

    const withoutParts = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    });
    const withParts = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });

    expect(withoutParts.statusCode).toBe(400);
    expect(withParts.statusCode).toBe(200);
    expect(b2.calls).toContain("completeMultipart");
    expect(await readFile(file.fileId)).toMatchObject({
      state: "done",
      multipart_upload_id: null,
    });
    await close();
  });

  it("fails what the browser reports failed, and aborts its multipart upload", async () => {
    const { b2, seedFile, complete, readFile, close } = await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const other = await seedFile({ position: 2 });

    const response = await complete(file.fileId, {
      outcome: "failed",
      problemCode: "storage_rejected",
      problemDetail: "The bucket answered 403.",
    });
    const serverVerdict = await complete(other.fileId, {
      outcome: "failed",
      problemCode: "abandoned",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<CompleteUploadFileResponse>().file).toMatchObject({
      state: "failed",
      problemCode: "storage_rejected",
    });
    expect(b2.calls).toContain("abortMultipart");
    expect(await readFile(file.fileId)).toMatchObject({
      state: "failed",
      problem_detail: "The bucket answered 403.",
      multipart_upload_id: null,
    });
    expect(serverVerdict.statusCode).toBe(400);
    expect((await readFile(other.fileId)).state).toBe("sending");
    await close();
  });

  it("queues what a failed file may have left in the bucket", async () => {
    const { database, sessionId, seedFile, complete, close } = await setUp();
    const reported = await seedFile({ position: 1 });
    const mismatched = await seedFile({ position: 2 });

    const reportedResponse = await complete(reported.fileId, {
      outcome: "failed",
      problemCode: "storage_rejected",
    });
    const mismatchedResponse = await complete(mismatched.fileId, {
      outcome: "done",
      contentHash: "f".repeat(64),
      byteSize: 1024,
    });

    expect(reportedResponse.statusCode).toBe(200);
    expect(mismatchedResponse.statusCode).toBe(409);
    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .orderBy("storage_key")
      .execute();
    const purposes: RenditionPurpose[] = [
      "original",
      "display",
      "thumb",
      "poster",
    ];
    const keysOf = (fileId: string) => {
      return purposes.map((purpose) => {
        return makeUploadStorageKeyFromRendition({
          sessionId,
          fileId,
          purpose,
          declaredContentType: JPEG,
        });
      });
    };
    expect(
      queued.map((row) => {
        return row.storage_key;
      }),
    ).toEqual(
      [...keysOf(reported.fileId), ...keysOf(mismatched.fileId)].sort(),
    );
    await close();
  });

  it("needs post-orientation dimensions from the call or the manifest", async () => {
    const { b2, seedFile, complete, readFile, close } = await setUp();
    const file = await seedFile({
      position: 1,
      overrides: { width: null, height: null },
    });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    });

    expect(response.statusCode).toBe(400);
    expect((await readFile(file.fileId)).state).toBe("sending");
    await close();
  });

  it("refuses a draft's files", async () => {
    const { seedFile, complete, close } = await setUp({
      session: { state: "draft", committed_at: null },
    });
    const file = await seedFile({
      position: 1,
      overrides: { state: "waiting", content_hash: null, storage_key: null },
    });

    const response = await complete(file.fileId, {
      outcome: "failed",
      problemCode: "connection_lost",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_session_conflict");
    await close();
  });

  it("answers one 404 for a file outside this batch, and for a stranger's session", async () => {
    const { app, database, memberId, sessionId, seedFile, complete, close } =
      await setUp();
    const file = await seedFile({ position: 1 });
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });
    const payload = { outcome: "failed", problemCode: "connection_lost" };

    const forElsewhere = await complete(elsewhereId, payload);
    const forNothing = await complete(createId(), payload);
    const forAdmin = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${file.fileId}/complete`,
      headers: { cookie: adminCookie },
      payload,
    });
    const forNoSession = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${createId()}/files/${file.fileId}/complete`,
      headers: { cookie: adminCookie },
      payload,
    });

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    expect(forAdmin.statusCode).toBe(404);
    expect(forAdmin.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forNoSession.body);
    await close();
  });

  it("lands one item and settles once when the same complete arrives twice at once", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const file = await seedFile({ position: 1 });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    holdHeadObjectsUntilTwoAreAsked(b2);
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    };

    const responses = await Promise.all([
      complete(file.fileId, payload),
      complete(file.fileId, payload),
    ]);

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([200, 200]);
    expect(
      responses.filter((response) => {
        return response.json<CompleteUploadFileResponse>().didSettle;
      }),
    ).toHaveLength(1);
    expect(await countItems()).toBe(1);
    expect((await readFile(file.fileId)).state).toBe("done");
    await close();
  });

  it("does not land a file whose row a sweep or a commit ended during verification", async () => {
    const { b2, database, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const swept = await seedFile({ position: 1 });
    const closed = await seedFile({ position: 2 });
    for (const file of [swept, closed]) {
      b2.storedObjects.set(file.keyOf("original"), {
        sizeBytes: 1024,
        contentType: JPEG,
      });
    }
    const done = (file: { contentHash: string }) => {
      return { outcome: "done", contentHash: file.contentHash, byteSize: 1024 };
    };

    changeRowDuringVerification({
      b2,
      database,
      operation: "headObject",
      fileId: swept.fileId,
      changes: { state: "failed", problem_code: "abandoned" },
    });
    const afterSweep = await complete(swept.fileId, done(swept));
    changeRowDuringVerification({
      b2,
      database,
      operation: "headObject",
      fileId: closed.fileId,
      changes: { state: "cancelled", problem_code: "cancelled_by_uploader" },
    });
    const afterClose = await complete(closed.fileId, done(closed));

    expect([afterSweep.statusCode, afterSweep.json().details?.state]).toEqual([
      409,
      "failed",
    ]);
    expect([afterClose.statusCode, afterClose.json().details?.state]).toEqual([
      409,
      "cancelled",
    ]);
    expect(await readFile(swept.fileId)).toMatchObject({
      state: "failed",
      problem_code: "abandoned",
      item_id: null,
    });
    expect(await readFile(closed.fileId)).toMatchObject({
      state: "cancelled",
      item_id: null,
    });
    expect(await countItems()).toBe(0);
    await close();
  });

  it("does not overwrite a row that was ended while its mismatch was being found", async () => {
    const { b2, database, seedFile, complete, readFile, close } = await setUp();
    const file = await seedFile({ position: 1 });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 999,
      contentType: JPEG,
    });
    changeRowDuringVerification({
      b2,
      database,
      operation: "headObject",
      fileId: file.fileId,
      changes: { state: "cancelled", problem_code: "cancelled_by_uploader" },
    });

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    });

    expect([response.statusCode, response.json().details?.state]).toEqual([
      409,
      "cancelled",
    ]);
    expect(await readFile(file.fileId)).toMatchObject({
      state: "cancelled",
      problem_code: "cancelled_by_uploader",
    });
    await close();
  });

  it("does not land a file whose upload or attempt changed during verification", async () => {
    const { b2, database, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const reopened = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const retried = await seedFile({ position: 2 });
    b2.storedObjects.set(retried.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    changeRowDuringVerification({
      b2,
      database,
      operation: "completeMultipart",
      fileId: reopened.fileId,
      changes: { multipart_upload_id: "upload-two" },
    });
    changeRowDuringVerification({
      b2,
      database,
      operation: "headObject",
      fileId: retried.fileId,
      changes: { attempt_count: 2 },
    });

    const afterReopen = await complete(reopened.fileId, {
      outcome: "done",
      contentHash: reopened.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    const afterRetry = await complete(retried.fileId, {
      outcome: "done",
      contentHash: retried.contentHash,
      byteSize: 1024,
    });

    expect([afterReopen.statusCode, afterReopen.json().details?.state]).toEqual(
      [409, "sending"],
    );
    expect([afterRetry.statusCode, afterRetry.json().details?.state]).toEqual([
      409,
      "sending",
    ]);
    expect((await readFile(reopened.fileId)).state).toBe("sending");
    expect((await readFile(retried.fileId)).state).toBe("sending");
    expect(await countItems()).toBe(0);
    await close();
  });

  it("aborts the multipart upload the row holds now, not the one it held when read", async () => {
    const { b2, database, seedFile, complete, close } = await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    // The thumb is reported and never arrives, so the file fails.
    changeRowDuringVerification({
      b2,
      database,
      operation: "completeMultipart",
      fileId: file.fileId,
      changes: { multipart_upload_id: "upload-two" },
    });
    const abortedUploadIds: string[] = [];
    const abortMultipart = b2.abortMultipart;
    b2.abortMultipart = (options) => {
      abortedUploadIds.push(options.uploadId);
      return abortMultipart(options);
    };

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
      renditions: [THUMB],
    });

    expect(response.statusCode).toBe(409);
    expect(abortedUploadIds).toEqual(["upload-two"]);
    await close();
  });

  it("fails a multipart file Backblaze refuses to assemble, instead of answering 503", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    b2.onCall = (operation) => {
      if (operation === "completeMultipart") {
        throw Object.assign(new Error("A part's ETag did not match."), {
          name: "InvalidPart",
        });
      }
    };

    const response = await complete(file.fileId, {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });

    expect([response.statusCode, response.json().details?.state]).toEqual([
      409,
      "failed",
    ]);
    expect(await readFile(file.fileId)).toMatchObject({
      state: "failed",
      problem_code: "content_mismatch",
    });
    expect(b2.calls).toContain("abortMultipart");
    expect(await countItems()).toBe(0);
    await close();
  });

  it("lands one item and aborts nothing when a multipart file's complete arrives twice at once", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    holdCompleteMultipartsUntilTwoAreAsked(b2);
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    };

    const responses = await Promise.all([
      complete(file.fileId, payload),
      complete(file.fileId, payload),
    ]);

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([200, 200]);
    expect(
      responses.filter((response) => {
        return response.json<CompleteUploadFileResponse>().didSettle;
      }),
    ).toHaveLength(1);
    expect(await countItems()).toBe(1);
    expect(await readFile(file.fileId)).toMatchObject({
      state: "done",
      multipart_upload_id: null,
    });
    expect(b2.calls).not.toContain("abortMultipart");
    await close();
  });

  it("retries a complete that arrives while the first is still assembling, and fails nothing", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    // The first complete is assembling a large file. Backblaze has consumed
    // the upload id already, so a second one is told it is gone, and the
    // object is not in the bucket until the first answers.
    let completeCount = 0;
    let finishAssembling = (): void => {};
    const assembled = new Promise<void>((resolve) => {
      finishAssembling = resolve;
    });
    b2.completeMultipart = async () => {
      completeCount += 1;
      if (completeCount > 1) {
        throw Object.assign(new Error("The upload is gone."), {
          name: "NoSuchUpload",
        });
      }
      await assembled;
      b2.storedObjects.set(file.keyOf("original"), {
        sizeBytes: 1024,
        contentType: JPEG,
      });
    };
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    };

    const first = complete(file.fileId, payload);
    await vi.waitFor(() => {
      expect(completeCount).toBe(1);
    });
    const second = await complete(file.fileId, payload);
    expect([second.statusCode, second.json().error]).toEqual([
      503,
      "upload_storage_unavailable",
    ]);
    expect((await readFile(file.fileId)).state).toBe("sending");
    finishAssembling();
    const firstResponse = await first;
    const retried = await complete(file.fileId, payload);

    expect(firstResponse.statusCode).toBe(200);
    expect(retried.statusCode).toBe(200);
    expect(retried.json<CompleteUploadFileResponse>().didSettle).toBe(false);
    expect(await countItems()).toBe(1);
    expect((await readFile(file.fileId)).state).toBe("done");
    expect(b2.calls).not.toContain("abortMultipart");
    await close();
  });

  it("refuses the wrong parts before asking Backblaze anything", async () => {
    const { b2, seedFile, complete, readFile, close } = await setUp();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const send = (parts: Array<{ partNumber: number; etag: string }>) => {
      return complete(file.fileId, {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
        parts,
      });
    };

    const responses = [
      // 1024 bytes are one part: a second, a gap and a repeat are all wrong.
      await send([
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
      ]),
      await send([{ partNumber: 2, etag: '"etag-2"' }]),
      await send([
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 1, etag: '"etag-1"' },
      ]),
    ];

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([400, 400, 400]);
    expect(b2.calls).toEqual([]);
    expect((await readFile(file.fileId)).state).toBe("sending");
    await close();
  });

  it("answers 403 to a viewer's own old session, after the 404 checks", async () => {
    const { app, database, sessionId, seedFile, complete, close } =
      await setUp();
    const strangersFile = await seedFile({ position: 1 });
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
      state: "settled",
      settled_at: NOW,
    });
    const viewerFileId = await insertUploadFile(database, {
      uploadSessionId: viewerSessionId,
    });
    const payload = { outcome: "failed", problemCode: "connection_lost" };
    const send = (sessionIdToSend: string, fileIdToSend: string) => {
      return app.inject({
        method: "POST",
        url: `/api/upload-sessions/${sessionIdToSend}/files/${fileIdToSend}/complete`,
        headers: { cookie: viewer.cookie },
        payload,
      });
    };

    const forOwn = await send(viewerSessionId, viewerFileId);
    const forStranger = await send(sessionId, strangersFile.fileId);

    expect(forOwn.statusCode).toBe(403);
    expect(forOwn.json().error).toBe("upload_forbidden");
    expect(forStranger.statusCode).toBe(404);
    expect(forStranger.json().error).toBe("upload_session_not_found");
    // The setUp member's own route stays reachable.
    expect((await complete(strangersFile.fileId, payload)).statusCode).toBe(
      200,
    );
    await close();
  });

  it("makes no Backblaze call while a transaction is open", async () => {
    // Every BEGIN IMMEDIATE the app issues goes through the watched handle,
    // so the watch knows exactly when a transaction is open.
    const watchedB2 = createFakeB2Client();
    const watch = failB2CallsInsideTransactions({
      database: createDatabase(":memory:"),
      b2: watchedB2,
    });
    const { b2, seedFile, complete, close } = await setUp({
      database: watch.database,
      b2: watchedB2,
    });
    const multipart = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const single = await seedFile({ position: 2 });
    const dropped = await seedFile({
      position: 3,
      multipartUploadId: "upload-three",
    });
    b2.storedObjects.set(multipart.keyOf("display"), {
      sizeBytes: 200_000,
      contentType: JPEG,
    });
    b2.storedObjects.set(multipart.keyOf("thumb"), {
      sizeBytes: 40_000,
      contentType: JPEG,
    });
    b2.storedObjects.set(single.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });

    const responses = [
      await complete(multipart.fileId, {
        outcome: "done",
        contentHash: multipart.contentHash,
        byteSize: 1024,
        width: 3024,
        height: 4032,
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
        renditions: [DISPLAY, THUMB],
      }),
      await complete(single.fileId, {
        outcome: "done",
        contentHash: single.contentHash,
        byteSize: 1024,
      }),
      await complete(dropped.fileId, {
        outcome: "failed",
        problemCode: "connection_lost",
      }),
    ];

    expect(watch.callsInsideTransactions).toEqual([]);
    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([200, 200, 200]);
    expect(responses[2]?.json<CompleteUploadFileResponse>().didSettle).toBe(
      true,
    );
    // The watch saw every kind of call complete makes, so the silence above
    // is a finding rather than an absence of calls.
    expect(b2.calls).toEqual(
      expect.arrayContaining([
        "completeMultipart",
        "headObject",
        "abortMultipart",
        "presignGet",
      ]),
    );
    await close();
  });
});
