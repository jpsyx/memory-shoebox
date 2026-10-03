import { JPEG, setUpUploadTestContext } from "./uploadCompleteTestHelpers.ts";

import { describe, expect, it } from "vitest";
import type {
  CompleteUploadFileResponse,
  RenditionPurpose,
} from "@memory-shoebox/shared";

import { createId } from "../../../../src/db/createId.ts";

import { makeUploadStorageKeyFromRendition } from "../../../../src/upload/presignUploadFile/uploadStorageKeyHelpers.ts";

import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import {
  insertUploadFile,
  insertUploadSession,
  NOW,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/complete", () => {
  it("repeats a done call idempotently, and refuses every other repeat", async () => {
    const { b2, seedFile, complete, countItems, close } =
      await setUpUploadTestContext();
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

    const first = await complete({
      fileId: landedFile.fileId,
      payload: done(landedFile),
    });
    const again = await complete({
      fileId: landedFile.fileId,
      payload: done(landedFile),
    });
    const failingADone = await complete({
      fileId: landedFile.fileId,
      payload: {
        outcome: "failed",
        problemCode: "connection_lost",
      },
    });
    const landingAFailed = await complete({
      fileId: failedFile.fileId,
      payload: done(failedFile),
    });
    const landingAWaiting = await complete({
      fileId: waitingFile.fileId,
      payload: done(waitingFile),
    });

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
    const { b2, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });

    const withoutParts = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
      },
    });
    const withParts = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
      },
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
    const { b2, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      multipartUploadId: "upload-one",
    });
    const other = await seedFile({ position: 2 });

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "failed",
        problemCode: "storage_rejected",
        problemDetail: "The bucket answered 403.",
      },
    });
    const serverVerdict = await complete({
      fileId: other.fileId,
      payload: {
        outcome: "failed",
        problemCode: "abandoned",
      },
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
    const { database, sessionId, seedFile, complete, close } =
      await setUpUploadTestContext();
    const reported = await seedFile({ position: 1 });
    const mismatched = await seedFile({ position: 2 });

    const reportedResponse = await complete({
      fileId: reported.fileId,
      payload: {
        outcome: "failed",
        problemCode: "storage_rejected",
      },
    });
    const mismatchedResponse = await complete({
      fileId: mismatched.fileId,
      payload: {
        outcome: "done",
        contentHash: "f".repeat(64),
        byteSize: 1024,
      },
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
    const { b2, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
    const file = await seedFile({
      position: 1,
      overrides: { width: null, height: null },
    });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
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

    expect(response.statusCode).toBe(400);
    expect((await readFile(file.fileId)).state).toBe("sending");
    await close();
  });

  it("refuses a draft's files", async () => {
    const { seedFile, complete, close } = await setUpUploadTestContext({
      session: { state: "draft", committed_at: null },
    });
    const file = await seedFile({
      position: 1,
      overrides: { state: "waiting", content_hash: null, storage_key: null },
    });

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "failed",
        problemCode: "connection_lost",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("upload_session_conflict");
    await close();
  });

  it("answers one 404 for a file outside this batch, and for a stranger's session", async () => {
    const { app, database, memberId, sessionId, seedFile, complete, close } =
      await setUpUploadTestContext();
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

    const forElsewhere = await complete({
      fileId: elsewhereId,
      payload: payload,
    });
    const forNothing = await complete({ fileId: createId(), payload: payload });
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
});
