import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type {
  CompleteUploadFileResponse,
  RetryUploadFileResponse,
} from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { makeUploadStorageKeyFromRendition } from "../../src/upload/presignUploadFile.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertMember,
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const JPEG = "image/jpeg";

const countUploadEmails = async (
  database: Kysely<Database>,
  sessionId: string,
): Promise<number> => {
  const rows = await database
    .selectFrom("outbound_emails")
    .select("id")
    .where("idempotency_key", "like", `upload:${sessionId}:%`)
    .execute();
  return rows.length;
};

const setUp = async () => {
  let currentTime = NOW;
  const testApp = await createTestApp({
    clock: () => {
      return new Date(currentTime);
    },
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    file_count: 2,
    total_bytes: 2048,
  });
  const seedFile = async (fileOptions: {
    position: number;
    overrides?: Partial<Database["upload_files"]>;
  }) => {
    const fileId = createId();
    const contentHash = createHash("sha256").update(fileId).digest("hex");
    const keyOf = (purpose: "original") => {
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
      attempt_count: 1,
      declared_bytes: 1024,
      content_hash: contentHash,
      storage_key: keyOf("original"),
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
  const post = (
    fileId: string,
    action: "presign" | "complete" | "retry",
    payload?: Record<string, unknown>,
  ) => {
    return testApp.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${fileId}/${action}`,
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
  const setTime = (instant: string) => {
    currentTime = instant;
  };
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    seedFile,
    post,
    readFile,
    setTime,
  };
};

describe("POST /api/upload-sessions/:sessionId/files/:fileId/retry", () => {
  it("puts a failed file back to waiting, keeping its attempts", async () => {
    const { b2, seedFile, post, readFile, close } = await setUp();
    const file = await seedFile({
      position: 1,
      overrides: {
        state: "failed",
        attempt_count: 2,
        problem_code: "connection_lost",
        problem_detail: "The network went away.",
        presigned_until: NOW,
        multipart_upload_id: "upload-old",
      },
    });
    // Still in flight, so the batch has not settled and the email is ahead.
    await seedFile({ position: 2 });

    const response = await post(file.fileId, "retry");

    expect(response.statusCode).toBe(200);
    expect(response.json<RetryUploadFileResponse>()).toMatchObject({
      isIncludedInEmail: true,
      file: {
        fileId: file.fileId,
        state: "waiting",
        problemCode: null,
        problemDetail: null,
        attemptCount: 2,
      },
    });
    expect(await readFile(file.fileId)).toMatchObject({
      state: "waiting",
      attempt_count: 2,
      problem_code: null,
      problem_detail: null,
      presigned_until: null,
      multipart_upload_id: null,
      content_hash: file.contentHash,
    });
    // The failure's own abort never got through; this one is outside the
    // transaction, and stops the old parts being billed.
    expect(b2.calls).toContain("abortMultipart");
    await close();
  });

  it.each(["waiting", "sending", "done", "refused", "cancelled"])(
    "refuses a %s row and says which state stopped it",
    async (state) => {
      const { seedFile, post, readFile, close } = await setUp();
      const file = await seedFile({ position: 1, overrides: { state } });

      const response = await post(file.fileId, "retry");

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "upload_file_conflict",
        details: { state },
      });
      expect((await readFile(file.fileId)).state).toBe(state);
      await close();
    },
  );

  it("sends no second email for a file recovered after the batch settled", async () => {
    const {
      b2,
      database,
      sessionId,
      seedFile,
      post,
      readFile,
      setTime,
      close,
    } = await setUp();
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    // Somebody who can see the batch and wants to hear about it.
    await insertMember(database, { display_name: "Tía Inés" });
    const landed = await seedFile({ position: 1 });
    const dropped = await seedFile({ position: 2 });
    b2.storedObjects.set(landed.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    const done = (file: { contentHash: string }) => {
      return { outcome: "done", contentHash: file.contentHash, byteSize: 1024 };
    };

    await post(landed.fileId, "complete", done(landed));
    const settling = await post(dropped.fileId, "complete", {
      outcome: "failed",
      problemCode: "connection_lost",
    });

    expect(settling.json<CompleteUploadFileResponse>().didSettle).toBe(true);
    expect(await countUploadEmails(database, sessionId)).toBe(1);

    setTime(shiftMinutes({ instant: NOW, minutes: 5 }));
    const retried = await post(dropped.fileId, "retry");
    const presigned = await post(dropped.fileId, "presign", {
      contentHash: dropped.contentHash,
      byteSize: 1024,
    });
    b2.storedObjects.set(dropped.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    const recovered = await post(dropped.fileId, "complete", done(dropped));

    expect(retried.json<RetryUploadFileResponse>()).toMatchObject({
      isIncludedInEmail: false,
      file: { state: "waiting" },
    });
    expect(presigned.statusCode).toBe(200);
    expect(recovered.json<CompleteUploadFileResponse>()).toMatchObject({
      didSettle: false,
      sessionState: "settled",
      file: { state: "done" },
    });
    expect(await countUploadEmails(database, sessionId)).toBe(1);
    const session = await database
      .selectFrom("upload_sessions")
      .select("settled_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.settled_at).toBe(NOW);
    expect((await readFile(dropped.fileId)).attempt_count).toBe(2);
    expect(
      await database.selectFrom("items").select("id").execute(),
    ).toHaveLength(2);
    await close();
  });

  it("answers one 404 for a file outside this batch, and for a stranger's session", async () => {
    const { app, database, memberId, sessionId, seedFile, post, close } =
      await setUp();
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed" },
    });
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
      state: "failed",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });

    const forElsewhere = await post(elsewhereId, "retry");
    const forNothing = await post(createId(), "retry");
    const forAdmin = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${file.fileId}/retry`,
      headers: { cookie: adminCookie },
    });
    const forNoSession = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${createId()}/files/${file.fileId}/retry`,
      headers: { cookie: adminCookie },
    });

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    expect(forAdmin.statusCode).toBe(404);
    expect(forAdmin.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forNoSession.body);
    await close();
  });

  it("refuses a viewer on their own session", async () => {
    const { database, close, app } = await setUp();
    const viewer = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });
    const viewerSessionId = await insertUploadSession(database, {
      uploadedBy: viewer.memberId,
    });
    const viewerFileId = await insertUploadFile(database, {
      uploadSessionId: viewerSessionId,
      state: "failed",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/upload-sessions/${viewerSessionId}/files/${viewerFileId}/retry`,
      headers: { cookie: viewer.cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("upload_forbidden");
    await close();
  });
});
