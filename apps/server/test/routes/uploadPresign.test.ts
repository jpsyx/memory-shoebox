import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PresignMultipart, PresignSingle } from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { createId } from "../../src/db/createId.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { settleUploadSession } from "../../src/upload/settleUploadSession.ts";
import type { FakeB2Client } from "../helpers/createFakeB2Client.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const HASH = createHash("sha256").update("the bytes").digest("hex");
const EARLIER = shiftMinutes({ instant: NOW, minutes: -10 });
const EXPIRES_AT = new Date(
  Date.parse(NOW) + appConfig.upload.presignTtlSeconds * 1000,
).toISOString();
const MULTIPART_BYTES = appConfig.upload.multipartThresholdBytes + 1;
const MULTIPART_PART_COUNT = Math.ceil(
  MULTIPART_BYTES / appConfig.upload.multipartPartSizeBytes,
);

/**
 * Holds every `presignMultipart` until `heldCount` of them are in flight, then
 * lets them all through, so two presigns that both read their row before
 * either writes it are both past Backblaze when the writes begin. Answers the
 * ids Backblaze handed out, in the order it opened them.
 */
const holdPresignMultipart = (b2: FakeB2Client, heldCount: number) => {
  const openedUploadIds: string[] = [];
  const gate = Promise.withResolvers<void>();
  const presignMultipart = b2.presignMultipart;
  let inFlightCount = 0;
  b2.presignMultipart = async (options) => {
    inFlightCount += 1;
    if (inFlightCount === heldCount) {
      gate.resolve();
    }
    await gate.promise;
    const started = await presignMultipart(options);
    openedUploadIds.push(started.uploadId);
    return started;
  };
  return { openedUploadIds };
};

const setUp = async (
  sessionOverrides: Partial<Database["upload_sessions"]> = {},
) => {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const { cookie, memberId } = await insertSignedInMember({
    database: testApp.database,
  });
  const sessionId = await insertUploadSession(testApp.database, {
    uploadedBy: memberId,
    last_activity_at: EARLIER,
    ...sessionOverrides,
  });
  const seedFile = (
    overrides: { position: number } & Partial<Database["upload_files"]>,
  ) => {
    return insertUploadFile(testApp.database, {
      uploadSessionId: sessionId,
      declared_bytes: 1024,
      ...overrides,
    });
  };
  const presign = (fileId: string, payload: Record<string, unknown>) => {
    return testApp.app.inject({
      method: "POST",
      url: `/api/upload-sessions/${sessionId}/files/${fileId}/presign`,
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
  const readSession = () => {
    return testApp.database
      .selectFrom("upload_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
  };
  return {
    ...testApp,
    cookie,
    memberId,
    sessionId,
    seedFile,
    presign,
    readFile,
    readSession,
  };
};

describe("POST /api/upload-sessions/:sessionId/files/:fileId/presign", () => {
  it.each([
    ["draft", { state: "draft", committed_at: null }],
    ["cancelled", { state: "cancelled", committed_at: null }],
  ] as const)("moves no byte on a %s session", async (_state, overrides) => {
    const { b2, seedFile, presign, readFile, close } = await setUp(overrides);
    const fileId = await seedFile({ position: 1 });

    const response = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1024,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_session_conflict");
    expect(b2.calls).toEqual([]);
    expect(await readFile(fileId)).toMatchObject({
      state: "waiting",
      content_hash: null,
      storage_key: null,
      attempt_count: 0,
    });
    await close();
  });

  it("signs one PUT for a small original, carrying the type it signed", async () => {
    const { sessionId, seedFile, presign, readFile, readSession, close } =
      await setUp();
    const fileId = await seedFile({
      position: 1,
      original_filename: "IMG_0001.HEIC",
      declared_content_type: "image/heic",
    });
    const key = `uploads/${sessionId}/${fileId}/original.heic`;

    const response = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1024,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<PresignSingle>();
    expect(body).toMatchObject({
      mode: "single",
      fileId,
      method: "PUT",
      expiresAt: EXPIRES_AT,
    });
    expect(body.headers).toEqual({ "Content-Type": "image/heic" });
    expect(body.url).toContain(encodeURIComponent(key));
    // The header is the type the URL was signed for, not a second opinion.
    expect(new URL(body.url).searchParams.get("contentType")).toBe(
      "image/heic",
    );
    expect(await readFile(fileId)).toMatchObject({
      state: "sending",
      content_hash: HASH,
      storage_key: key,
      presigned_until: EXPIRES_AT,
      multipart_upload_id: null,
      attempt_count: 1,
    });
    expect((await readSession()).last_activity_at).toBe(NOW);

    // An expired URL is presigned again, and that is another attempt.
    const again = await presign(fileId, { contentHash: HASH, byteSize: 1024 });
    expect(again.statusCode).toBe(200);
    expect(await readFile(fileId)).toMatchObject({
      storage_key: key,
      attempt_count: 2,
    });
    await close();
  });

  it("opens a multipart upload once, and re-signs only the parts asked for", async () => {
    const { b2, sessionId, seedFile, presign, readFile, close } = await setUp();
    const fileId = await seedFile({
      position: 1,
      original_filename: "IMG_0002.MOV",
      declared_content_type: "video/quicktime",
      declared_bytes: MULTIPART_BYTES,
    });

    const first = await presign(fileId, {
      contentHash: HASH,
      byteSize: MULTIPART_BYTES,
    });

    expect(first.statusCode).toBe(200);
    const opened = first.json<PresignMultipart>();
    expect(opened).toMatchObject({
      mode: "multipart",
      fileId,
      partSizeBytes: appConfig.upload.multipartPartSizeBytes,
      partCount: MULTIPART_PART_COUNT,
      method: "PUT",
      expiresAt: EXPIRES_AT,
    });
    expect(opened.headers).toEqual({});
    expect(
      opened.parts.map((part) => {
        return part.partNumber;
      }),
    ).toEqual(
      Array.from({ length: MULTIPART_PART_COUNT }, (_unused, index) => {
        return index + 1;
      }),
    );
    expect(await readFile(fileId)).toMatchObject({
      state: "sending",
      storage_key: `uploads/${sessionId}/${fileId}/original.mov`,
      multipart_upload_id: opened.multipartUploadId,
      attempt_count: 1,
    });

    const second = await presign(fileId, {
      contentHash: HASH,
      byteSize: MULTIPART_BYTES,
      partNumbers: [3],
    });

    const resigned = second.json<PresignMultipart>();
    expect(resigned.multipartUploadId).toBe(opened.multipartUploadId);
    expect(
      resigned.parts.map((part) => {
        return part.partNumber;
      }),
    ).toEqual([3]);
    expect(
      b2.calls.filter((operation) => {
        return operation === "presignMultipart";
      }),
    ).toHaveLength(1);
    expect(b2.calls).toContain("signParts");
    expect((await readFile(fileId)).attempt_count).toBe(2);
    await close();
  });

  it("refuses a part the file does not have, and parts for a single PUT", async () => {
    const { b2, seedFile, presign, readFile, close } = await setUp();
    const largeId = await seedFile({
      position: 1,
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    const smallId = await seedFile({ position: 2 });

    const pastTheEnd = await presign(largeId, {
      contentHash: HASH,
      byteSize: MULTIPART_BYTES,
      partNumbers: [MULTIPART_PART_COUNT + 1],
    });
    const onASingle = await presign(smallId, {
      contentHash: HASH,
      byteSize: 1024,
      partNumbers: [1],
    });

    expect(pastTheEnd.statusCode).toBe(400);
    expect(onASingle.statusCode).toBe(400);
    expect(b2.calls).toEqual([]);
    expect((await readFile(largeId)).state).toBe("waiting");
    await close();
  });

  it("rides a derivative on the original's presign without counting it", async () => {
    const { sessionId, seedFile, presign, readFile, close } = await setUp();
    const fileId = await seedFile({ position: 1 });

    const early = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1024,
      purpose: "thumb",
    });
    await presign(fileId, { contentHash: HASH, byteSize: 1024 });
    const display = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1024,
      purpose: "display",
    });
    const transcode = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1024,
      purpose: "video_mp4",
    });

    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({
      error: "upload_file_conflict",
      details: { state: "waiting" },
    });
    expect(display.statusCode).toBe(200);
    const body = display.json<PresignSingle>();
    expect(body.mode).toBe("single");
    expect(body.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(body.url).toContain(
      encodeURIComponent(`uploads/${sessionId}/${fileId}/display.jpg`),
    );
    expect(new URL(body.url).searchParams.get("contentType")).toBe(
      "image/jpeg",
    );
    expect(transcode.statusCode).toBe(400);
    expect(await readFile(fileId)).toMatchObject({
      storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
      attempt_count: 1,
    });
    await close();
  });

  it("bumps the file's own updated_at on a derivative's presign, not only the batch's", async () => {
    const { sessionId, seedFile, presign, readFile, readSession, close } =
      await setUp();
    // Retried after its batch settled, the row's own clock is what the sweep
    // reads, so every presign of it must move that clock.
    const fileId = await seedFile({
      position: 1,
      state: "sending",
      content_hash: HASH,
      storage_key: `uploads/${sessionId}/file/original.jpg`,
      updated_at: EARLIER,
    });

    const response = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1024,
      purpose: "thumb",
    });

    expect(response.statusCode).toBe(200);
    expect((await readFile(fileId)).updated_at).toBe(NOW);
    expect((await readSession()).last_activity_at).toBe(NOW);
    await close();
  });

  it("cancels a second copy of the same bytes, names the first, and lets the batch settle", async () => {
    const { database, b2, sessionId, seedFile, presign, readFile, close } =
      await setUp();
    const firstId = await seedFile({
      position: 1,
      original_filename: "IMG_0001.jpg",
    });
    const copyId = await seedFile({
      position: 2,
      original_filename: "IMG_0001 (1).jpg",
    });

    const first = await presign(firstId, { contentHash: HASH, byteSize: 1024 });
    const callsBeforeCopy = [...b2.calls];
    const copy = await presign(copyId, { contentHash: HASH, byteSize: 1024 });

    expect(first.statusCode).toBe(200);
    expect(copy.statusCode).toBe(409);
    expect(copy.json()).toMatchObject({
      error: "upload_file_conflict",
      details: { fileId: firstId, state: "cancelled" },
    });
    // No Backblaze call was made for the copy.
    expect(b2.calls).toEqual(callsBeforeCopy);
    expect(await readFile(copyId)).toMatchObject({
      state: "cancelled",
      problem_code: null,
      problem_detail:
        "Identical to IMG_0001.jpg, which is already in this batch.",
      content_hash: null,
      storage_key: null,
      attempt_count: 0,
    });

    // The copy is terminal, so the latch fires the moment the first lands.
    await database
      .updateTable("upload_files")
      .set({ state: "done" })
      .where("id", "=", firstId)
      .execute();
    const settled = await runInImmediateTransaction({
      database,
      callback: (transaction) => {
        return settleUploadSession({ transaction, sessionId, now: NOW });
      },
    });
    expect(settled.didSettle).toBe(true);
    await close();
  });

  it("keeps one upload when one file is presigned twice at once, and aborts the other", async () => {
    const { b2, sessionId, seedFile, presign, readFile, close } = await setUp();
    const fileId = await seedFile({
      position: 1,
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    const { openedUploadIds } = holdPresignMultipart(b2, 2);
    const abortMultipart = vi.spyOn(b2, "abortMultipart");
    const payload = { contentHash: HASH, byteSize: MULTIPART_BYTES };

    const [first, second] = await Promise.all([
      presign(fileId, payload),
      presign(fileId, payload),
    ]);

    const [winner, loser] =
      first.statusCode === 200 ? [first, second] : [second, first];
    const winnerUploadId = winner.json<PresignMultipart>().multipartUploadId;
    const [loserUploadId] = openedUploadIds.filter((uploadId) => {
      return uploadId !== winnerUploadId;
    });
    expect(openedUploadIds).toHaveLength(2);
    expect(winner.statusCode).toBe(200);
    expect(loser.statusCode).toBe(409);
    expect(loser.json()).toMatchObject({
      error: "upload_file_conflict",
      details: { state: "sending" },
    });
    expect(await readFile(fileId)).toMatchObject({
      state: "sending",
      multipart_upload_id: winnerUploadId,
      attempt_count: 1,
    });
    expect(abortMultipart).toHaveBeenCalledTimes(1);
    expect(abortMultipart).toHaveBeenCalledWith({
      key: `uploads/${sessionId}/${fileId}/original.mp4`,
      uploadId: loserUploadId,
    });
    await close();
  });

  it("cancels the second of two rows presigned with the same bytes at once, and aborts its upload", async () => {
    const { b2, sessionId, seedFile, presign, readFile, close } = await setUp();
    const firstId = await seedFile({
      position: 1,
      original_filename: "IMG_0001.mp4",
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    const copyId = await seedFile({
      position: 2,
      original_filename: "IMG_0001 (1).mp4",
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    const { openedUploadIds } = holdPresignMultipart(b2, 2);
    const abortMultipart = vi.spyOn(b2, "abortMultipart");
    const payload = { contentHash: HASH, byteSize: MULTIPART_BYTES };

    // Neither row has a hash yet, so both clear the probe and both open an
    // upload; only the write inside the transaction can tell them apart.
    const [first, copy] = await Promise.all([
      presign(firstId, payload),
      presign(copyId, payload),
    ]);

    const [winner, loser] =
      first.statusCode === 200 ? [first, copy] : [copy, first];
    const winnerBody = winner.json<PresignMultipart>();
    const winnerId = winnerBody.fileId;
    const loserId = winnerId === firstId ? copyId : firstId;
    const [loserUploadId] = openedUploadIds.filter((uploadId) => {
      return uploadId !== winnerBody.multipartUploadId;
    });
    expect(openedUploadIds).toHaveLength(2);
    expect(winner.statusCode).toBe(200);
    expect(loser.statusCode).toBe(409);
    expect(loser.json()).toMatchObject({
      error: "upload_file_conflict",
      details: { fileId: winnerId, state: "cancelled" },
    });
    expect(await readFile(winnerId)).toMatchObject({
      state: "sending",
      content_hash: HASH,
      multipart_upload_id: winnerBody.multipartUploadId,
      attempt_count: 1,
    });
    expect(await readFile(loserId)).toMatchObject({
      state: "cancelled",
      problem_code: null,
      problem_detail: `Identical to ${(await readFile(winnerId)).original_filename}, which is already in this batch.`,
      content_hash: null,
      storage_key: null,
      multipart_upload_id: null,
      attempt_count: 0,
    });
    expect(abortMultipart).toHaveBeenCalledTimes(1);
    expect(abortMultipart).toHaveBeenCalledWith({
      key: `uploads/${sessionId}/${loserId}/original.mp4`,
      uploadId: loserUploadId,
    });
    await close();
  });

  it.each(["done", "failed", "refused", "cancelled"])(
    "refuses a %s row and says which state stopped it",
    async (state) => {
      const { seedFile, presign, close } = await setUp();
      const fileId = await seedFile({ position: 1, state });

      const response = await presign(fileId, {
        contentHash: HASH,
        byteSize: 1024,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "upload_file_conflict",
        details: { state },
      });
      await close();
    },
  );

  it("refuses a size or a hash the row disagrees with", async () => {
    const { seedFile, presign, close } = await setUp();
    const fileId = await seedFile({ position: 1 });

    const wrongSize = await presign(fileId, {
      contentHash: HASH,
      byteSize: 1025,
    });
    await presign(fileId, { contentHash: HASH, byteSize: 1024 });
    const wrongHash = await presign(fileId, {
      contentHash: createHash("sha256").update("other bytes").digest("hex"),
      byteSize: 1024,
    });

    expect(wrongSize.statusCode).toBe(400);
    expect(wrongHash.statusCode).toBe(400);
    await close();
  });

  it("writes nothing when Backblaze is down", async () => {
    const { b2, seedFile, presign, readFile, readSession, close } =
      await setUp();
    const fileId = await seedFile({
      position: 1,
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    b2.isUnavailable = true;

    const response = await presign(fileId, {
      contentHash: HASH,
      byteSize: MULTIPART_BYTES,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("upload_storage_unavailable");
    expect(await readFile(fileId)).toMatchObject({
      state: "waiting",
      content_hash: null,
      storage_key: null,
      multipart_upload_id: null,
      attempt_count: 0,
    });
    expect((await readSession()).last_activity_at).toBe(EARLIER);
    await close();
  });

  it("answers one 404 for a file outside this batch", async () => {
    const { database, memberId, presign, close } = await setUp();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
    });

    const forElsewhere = await presign(elsewhereId, {
      contentHash: HASH,
      byteSize: 1024,
    });
    const forNothing = await presign(createId(), {
      contentHash: HASH,
      byteSize: 1024,
    });

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    await close();
  });

  it("is the uploader's alone: one 404 for anybody else, an admin included", async () => {
    const { app, database, sessionId, seedFile, close } = await setUp();
    const fileId = await seedFile({ position: 1 });
    const { cookie: otherCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });
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
    });
    const send = (
      sessionIdToSend: string,
      fileIdToSend: string,
      cookie: string,
    ) => {
      return app.inject({
        method: "POST",
        url: `/api/upload-sessions/${sessionIdToSend}/files/${fileIdToSend}/presign`,
        headers: { cookie },
        payload: { contentHash: HASH, byteSize: 1024 },
      });
    };

    const forOther = await send(sessionId, fileId, otherCookie);
    const forAdmin = await send(sessionId, fileId, adminCookie);
    const forNothing = await send(createId(), fileId, otherCookie);
    const forViewer = await send(viewerSessionId, viewerFileId, viewer.cookie);

    expect(forOther.statusCode).toBe(404);
    expect(forOther.json().error).toBe("upload_session_not_found");
    expect(forAdmin.body).toBe(forOther.body);
    expect(forNothing.body).toBe(forOther.body);
    expect(forViewer.statusCode).toBe(403);
    expect(forViewer.json().error).toBe("upload_forbidden");
    await close();
  });
});
