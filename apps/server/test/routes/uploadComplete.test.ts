import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { CompleteUploadFileResponse } from "@memory-shoebox/shared";
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
