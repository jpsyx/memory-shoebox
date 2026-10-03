import {
  ORIGINAL_KEY,
  THUMB_KEY,
  makeFile,
  makeTransfer,
} from "./verifyUploadedObjectsTestHelpers.ts";
import { describe, expect, it } from "vitest";

import { verifyUploadedObjects } from "../../../../src/upload/verifyUploadedObjects/verifyUploadedObjects.ts";

import { createFakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";

describe("verifyUploadedObjects", () => {
  it("fails bytes the presign did not see, without asking Backblaze", async () => {
    const b2 = createFakeB2Client();

    const byHash = await verifyUploadedObjects({
      b2,
      file: makeFile(),
      transfer: makeTransfer({ contentHash: "b".repeat(64) }),
    });
    const bySize = await verifyUploadedObjects({
      b2,
      file: makeFile(),
      transfer: makeTransfer({ byteSize: 1025 }),
    });

    expect(byHash).toMatchObject({
      isVerified: false,
      problemCode: "checksum_mismatch",
    });
    expect(bySize).toMatchObject({
      isVerified: false,
      problemCode: "checksum_mismatch",
    });
    expect(b2.calls).toEqual([]);
  });

  it("checks a single original and every reported derivative by HEAD", async () => {
    const b2 = createFakeB2Client();
    b2.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 1024,
      contentType: "image/jpeg",
    });
    b2.storedObjects.set(THUMB_KEY, {
      sizeBytes: 40_000,
      contentType: "image/jpeg",
    });

    const result = await verifyUploadedObjects({
      b2,
      file: makeFile(),
      transfer: makeTransfer({
        renditions: [
          { purpose: "thumb", byteSize: 40_000, width: 480, height: 360 },
        ],
      }),
    });

    expect(result).toEqual({
      isVerified: true,
      renditions: [
        {
          purpose: "original",
          storageKey: ORIGINAL_KEY,
          contentType: "image/jpeg",
          byteSize: 1024,
          width: 4032,
          height: 3024,
        },
        {
          purpose: "thumb",
          storageKey: THUMB_KEY,
          contentType: "image/jpeg",
          byteSize: 40_000,
          width: 480,
          height: 360,
        },
      ],
    });
    expect(
      b2.calls.filter((operation) => {
        return operation === "headObject";
      }),
    ).toHaveLength(2);
  });

  it("fails as content_mismatch when the bucket disagrees or a derivative is missing", async () => {
    const wrongSize = createFakeB2Client();
    wrongSize.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 999,
      contentType: "image/jpeg",
    });
    const missingThumb = createFakeB2Client();
    missingThumb.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 1024,
      contentType: "image/jpeg",
    });

    const whenSmaller = await verifyUploadedObjects({
      b2: wrongSize,
      file: makeFile(),
      transfer: makeTransfer(),
    });
    const whenMissing = await verifyUploadedObjects({
      b2: missingThumb,
      file: makeFile(),
      transfer: makeTransfer({
        renditions: [
          { purpose: "thumb", byteSize: 40_000, width: 480, height: 360 },
        ],
      }),
    });

    expect(whenSmaller).toMatchObject({
      isVerified: false,
      problemCode: "content_mismatch",
    });
    expect(whenMissing).toMatchObject({
      isVerified: false,
      problemCode: "content_mismatch",
    });
  });

  it("completes a multipart original with the browser's ETags, and survives a lost answer", async () => {
    const file = makeFile({
      multipart_upload_id: "upload-1",
      declared_bytes: 70_000_000,
    });
    const transfer = makeTransfer({
      byteSize: 70_000_000,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    // What a complete whose answer was lost looks like on the next call: the
    // upload id is gone, and Backblaze says so by name.
    const failingComplete = (operation: string) => {
      if (operation === "completeMultipart") {
        throw Object.assign(new Error("The upload is gone."), {
          name: "NoSuchUpload",
        });
      }
    };
    const healthy = createFakeB2Client();
    // What Backblaze assembled from the parts.
    healthy.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 70_000_000,
      contentType: "video/mp4",
    });
    const answerLost = createFakeB2Client();
    answerLost.onCall = failingComplete;
    answerLost.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 70_000_000,
      contentType: "video/mp4",
    });
    const neverLanded = createFakeB2Client();
    neverLanded.onCall = failingComplete;

    const completed = await verifyUploadedObjects({
      b2: healthy,
      file,
      transfer,
    });
    const recovered = await verifyUploadedObjects({
      b2: answerLost,
      file,
      transfer,
    });

    expect(completed.isVerified).toBe(true);
    expect(healthy.calls).toEqual(["completeMultipart", "headObject"]);
    expect(recovered.isVerified).toBe(true);
    // No object yet might be the first complete still assembling, so this is
    // retried; the sweep fails an upload that truly vanished.
    await expect(
      verifyUploadedObjects({ b2: neverLanded, file, transfer }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "upload_storage_unavailable",
    });
  });

  it("checks the size of what a multipart complete assembled, as a single PUT's", async () => {
    const file = makeFile({
      multipart_upload_id: "upload-1",
      declared_bytes: 70_000_000,
    });
    const transfer = makeTransfer({
      byteSize: 70_000_000,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    const b2 = createFakeB2Client();
    // Parts the browser sent from the wrong slices of the file assemble into
    // an object Backblaze accepts and the declared size does not match.
    b2.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 69_999_999,
      contentType: "video/mp4",
    });

    const result = await verifyUploadedObjects({ b2, file, transfer });

    expect(b2.calls).toEqual(["completeMultipart", "headObject"]);
    expect(result).toMatchObject({
      isVerified: false,
      problemCode: "content_mismatch",
    });
    expect(result.isVerified ? "" : result.problemDetail).toContain(
      "69999999 bytes",
    );
  });

  it("answers 503 when a multipart complete fails for a reason that might pass, and no object is there", async () => {
    const file = makeFile({
      multipart_upload_id: "upload-1",
      declared_bytes: 70_000_000,
    });
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "completeMultipart") {
        throw Object.assign(new Error("The request timed out."), {
          name: "TimeoutError",
        });
      }
    };

    await expect(
      verifyUploadedObjects({
        b2,
        file,
        transfer: makeTransfer({
          byteSize: 70_000_000,
          parts: [{ partNumber: 1, etag: '"etag-1"' }],
        }),
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "upload_storage_unavailable",
    });
  });
});
