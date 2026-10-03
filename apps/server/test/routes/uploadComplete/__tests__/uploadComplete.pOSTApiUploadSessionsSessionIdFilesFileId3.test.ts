import {
  JPEG,
  THUMB,
  holdHeadObjectsUntilTwoAreAsked,
  changeRowDuringVerification,
  setUpUploadTestContext,
} from "./uploadCompleteTestHelpers.ts";

import { describe, expect, it } from "vitest";
import type { CompleteUploadFileResponse } from "@memory-shoebox/shared";

describe("POST /api/upload-sessions/:sessionId/files/:fileId/complete", () => {
  it("lands one item and settles once when the same complete arrives twice at once", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
    const file = await seedFile({ position: 1 });
    b2.storedObjects.set(file.keyOf("original"), {
      sizeBytes: 1024,
      contentType: JPEG,
    });
    holdHeadObjectsUntilTwoAreAsked({ b2 });
    const payload = {
      outcome: "done",
      contentHash: file.contentHash,
      byteSize: 1024,
    };

    const responses = await Promise.all([
      complete({ fileId: file.fileId, payload: payload }),
      complete({ fileId: file.fileId, payload: payload }),
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
      await setUpUploadTestContext();
    const swept = await seedFile({ position: 1 });
    const closed = await seedFile({ position: 2 });
    [swept, closed].forEach((file) => {
      b2.storedObjects.set(file.keyOf("original"), {
        sizeBytes: 1024,
        contentType: JPEG,
      });
    });
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
    const afterSweep = await complete({
      fileId: swept.fileId,
      payload: done(swept),
    });
    changeRowDuringVerification({
      b2,
      database,
      operation: "headObject",
      fileId: closed.fileId,
      changes: { state: "cancelled", problem_code: "cancelled_by_uploader" },
    });
    const afterClose = await complete({
      fileId: closed.fileId,
      payload: done(closed),
    });

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
    const { b2, database, seedFile, complete, readFile, close } =
      await setUpUploadTestContext();
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

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
      },
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
      await setUpUploadTestContext();
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
      // The reopened file's complete now HEADs its own original too.
      key: retried.keyOf("original"),
    });

    const afterReopen = await complete({
      fileId: reopened.fileId,
      payload: {
        outcome: "done",
        contentHash: reopened.contentHash,
        byteSize: 1024,
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
      },
    });
    const afterRetry = await complete({
      fileId: retried.fileId,
      payload: {
        outcome: "done",
        contentHash: retried.contentHash,
        byteSize: 1024,
      },
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
    const { b2, database, seedFile, complete, close } =
      await setUpUploadTestContext();
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

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
        renditions: [THUMB],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(abortedUploadIds).toEqual(["upload-two"]);
    await close();
  });

  it("fails a multipart file Backblaze refuses to assemble, instead of answering 503", async () => {
    const { b2, seedFile, complete, readFile, countItems, close } =
      await setUpUploadTestContext();
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

    const response = await complete({
      fileId: file.fileId,
      payload: {
        outcome: "done",
        contentHash: file.contentHash,
        byteSize: 1024,
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
      },
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
});
