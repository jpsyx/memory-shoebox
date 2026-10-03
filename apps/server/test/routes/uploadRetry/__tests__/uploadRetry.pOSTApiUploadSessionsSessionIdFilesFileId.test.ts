import {
  countUploadEmails,
  setUpUploadTestContext,
  settleWithOneDropped,
  recoverDroppedFile,
} from "./uploadRetryTestHelpers.ts";

import { describe, expect, it } from "vitest";
import type {
  CompleteUploadFileResponse,
  RetryUploadFileResponse,
} from "@memory-shoebox/shared";
import { createDatabase } from "../../../../src/db/client.ts";
import { createId } from "../../../../src/db/createId.ts";

import { createFakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";

import { failB2CallsInsideTransactions } from "../../../helpers/failB2CallsInsideTransactions/failB2CallsInsideTransactions.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertInstanceSetting,
  insertMember,
  insertPendingObjectDeletion,
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/retry", () => {
  it("puts a failed file back to waiting, keeping its attempts", async () => {
    const { b2, seedFile, post, readFile, close } =
      await setUpUploadTestContext();
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

    const response = await post({ fileId: file.fileId, action: "retry" });

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
      const { seedFile, post, readFile, close } =
        await setUpUploadTestContext();
      const file = await seedFile({ position: 1, overrides: { state } });

      const response = await post({ fileId: file.fileId, action: "retry" });

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
    const context = await setUpUploadTestContext();
    const { database, sessionId, seedFile, readFile, close } = context;
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    // Somebody who can see the batch and wants to hear about it.
    await insertMember(database, { display_name: "Tía Inés" });
    const landed = await seedFile({ position: 1 });
    const dropped = await seedFile({ position: 2 });

    const settling = await settleWithOneDropped({
      context: context,
      files: {
        landed: [landed],
        dropped,
      },
    });

    expect(settling.json<CompleteUploadFileResponse>().didSettle).toBe(true);
    expect(
      await countUploadEmails({ database: database, sessionId: sessionId }),
    ).toBe(1);

    const { retried, presigned, recovered } = await recoverDroppedFile({
      context: context,
      dropped: dropped,
    });

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
    expect(
      await countUploadEmails({ database: database, sessionId: sessionId }),
    ).toBe(1);
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
      await setUpUploadTestContext();
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

    const forElsewhere = await post({ fileId: elsewhereId, action: "retry" });
    const forNothing = await post({ fileId: createId(), action: "retry" });
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
    const { database, close, app } = await setUpUploadTestContext();
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

  it("records the retry as activity on the batch", async () => {
    const { database, sessionId, seedFile, post, setTime, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed" },
    });
    const retriedAt = shiftMinutes({ instant: NOW, minutes: 5 });
    setTime(retriedAt);

    await post({ fileId: file.fileId, action: "retry" });

    const session = await database
      .selectFrom("upload_sessions")
      .select("last_activity_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_activity_at).toBe(retriedAt);
    await close();
  });

  it("aborts the stale multipart upload after its transaction has closed", async () => {
    // Every BEGIN IMMEDIATE the app issues goes through the watched handle,
    // so the watch knows exactly when a transaction is open.
    const watchedB2 = createFakeB2Client();
    const watch = failB2CallsInsideTransactions({
      database: createDatabase(":memory:"),
      b2: watchedB2,
    });
    const { b2, seedFile, post, readFile, close } =
      await setUpUploadTestContext({
        database: watch.database,
        b2: watchedB2,
      });
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed", multipart_upload_id: "upload-old" },
    });

    const response = await post({ fileId: file.fileId, action: "retry" });

    expect(response.statusCode).toBe(200);
    expect(b2.calls).toContain("abortMultipart");
    expect(watch.callsInsideTransactions).toEqual([]);
    expect((await readFile(file.fileId)).multipart_upload_id).toBeNull();
    await close();
  });

  it("takes this file's keys back from the deletion queue, and nobody else's", async () => {
    const { database, seedFile, post, close } = await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      overrides: { state: "failed", problem_code: "abandoned" },
    });
    const sibling = await seedFile({
      position: 2,
      overrides: { state: "failed", problem_code: "abandoned" },
    });
    const unrelatedKey = "uploads/another-session/another-file/original.jpg";
    // What the abandon sweep queues for a row it fails: every key it might
    // have written. The drain deletes by key and never checks use, so a key
    // the retry is about to reuse must leave the queue with the retry.
    for (const purpose of ["original", "display", "thumb", "poster"] as const) {
      await insertPendingObjectDeletion(database, {
        storageKey: file.keyOf(purpose),
      });
    }
    await insertPendingObjectDeletion(database, {
      storageKey: sibling.keyOf("original"),
    });
    await insertPendingObjectDeletion(database, { storageKey: unrelatedKey });

    const response = await post({ fileId: file.fileId, action: "retry" });

    expect(response.statusCode).toBe(200);
    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .orderBy("storage_key")
      .execute();
    expect(
      queued.map((row) => {
        return row.storage_key;
      }),
    ).toEqual([unrelatedKey, sibling.keyOf("original")].toSorted());
    await close();
  });
});
