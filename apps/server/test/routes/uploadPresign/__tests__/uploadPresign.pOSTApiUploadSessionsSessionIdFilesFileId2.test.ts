import {
  HASH,
  EARLIER,
  MULTIPART_BYTES,
  holdPresignMultipart,
  setUpUploadTestContext,
} from "./uploadPresignTestHelpers.ts";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PresignMultipart } from "@memory-shoebox/shared";

import { createId } from "../../../../src/db/createId.ts";
import { runInImmediateTransaction } from "../../../../src/db/runInImmediateTransaction.ts";

import { settleUploadSession } from "../../../../src/upload/settleUploadSession.ts";

import {
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/presign", () => {
  it("cancels a second copy of the same bytes, names the first, and lets the batch settle", async () => {
    const { database, b2, sessionId, seedFile, presign, readFile, close } =
      await setUpUploadTestContext();
    const firstId = await seedFile({
      position: 1,
      original_filename: "IMG_0001.jpg",
    });
    const copyId = await seedFile({
      position: 2,
      original_filename: "IMG_0001 (1).jpg",
    });

    const first = await presign({
      fileId: firstId,
      payload: { contentHash: HASH, byteSize: 1024 },
    });
    const callsBeforeCopy = [...b2.calls];
    const copy = await presign({
      fileId: copyId,
      payload: { contentHash: HASH, byteSize: 1024 },
    });

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
    const { b2, sessionId, seedFile, presign, readFile, close } =
      await setUpUploadTestContext();
    const fileId = await seedFile({
      position: 1,
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    const { openedUploadIds } = holdPresignMultipart({ b2: b2, heldCount: 2 });
    const abortMultipart = vi.spyOn(b2, "abortMultipart");
    const payload = { contentHash: HASH, byteSize: MULTIPART_BYTES };

    const [first, second] = await Promise.all([
      presign({ fileId: fileId, payload: payload }),
      presign({ fileId: fileId, payload: payload }),
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
    const { b2, sessionId, seedFile, presign, readFile, close } =
      await setUpUploadTestContext();
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
    const { openedUploadIds } = holdPresignMultipart({ b2: b2, heldCount: 2 });
    const abortMultipart = vi.spyOn(b2, "abortMultipart");
    const payload = { contentHash: HASH, byteSize: MULTIPART_BYTES };

    // Neither row has a hash yet, so both clear the probe and both open an
    // upload; only the write inside the transaction can tell them apart.
    const [first, copy] = await Promise.all([
      presign({ fileId: firstId, payload: payload }),
      presign({ fileId: copyId, payload: payload }),
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
      const { seedFile, presign, close } = await setUpUploadTestContext();
      const fileId = await seedFile({ position: 1, state });

      const response = await presign({
        fileId: fileId,
        payload: {
          contentHash: HASH,
          byteSize: 1024,
        },
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
    const { seedFile, presign, close } = await setUpUploadTestContext();
    const fileId = await seedFile({ position: 1 });

    const wrongSize = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: 1025,
      },
    });
    await presign({
      fileId: fileId,
      payload: { contentHash: HASH, byteSize: 1024 },
    });
    const wrongHash = await presign({
      fileId: fileId,
      payload: {
        contentHash: createHash("sha256").update("other bytes").digest("hex"),
        byteSize: 1024,
      },
    });

    expect(wrongSize.statusCode).toBe(400);
    expect(wrongHash.statusCode).toBe(400);
    await close();
  });

  it("writes nothing when Backblaze is down", async () => {
    const { b2, seedFile, presign, readFile, readSession, close } =
      await setUpUploadTestContext();
    const fileId = await seedFile({
      position: 1,
      declared_content_type: "video/mp4",
      declared_bytes: MULTIPART_BYTES,
    });
    b2.isUnavailable = true;

    const response = await presign({
      fileId: fileId,
      payload: {
        contentHash: HASH,
        byteSize: MULTIPART_BYTES,
      },
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
    const { database, memberId, presign, close } =
      await setUpUploadTestContext();
    const otherSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
      state: "settled",
      settled_at: NOW,
    });
    const elsewhereId = await insertUploadFile(database, {
      uploadSessionId: otherSessionId,
    });

    const forElsewhere = await presign({
      fileId: elsewhereId,
      payload: {
        contentHash: HASH,
        byteSize: 1024,
      },
    });
    const forNothing = await presign({
      fileId: createId(),
      payload: {
        contentHash: HASH,
        byteSize: 1024,
      },
    });

    expect(forElsewhere.statusCode).toBe(404);
    expect(forElsewhere.json().error).toBe("upload_file_not_found");
    expect(forElsewhere.body).toBe(forNothing.body);
    await close();
  });
});
