import { describe, expect, it } from "vitest";
import type { CompleteUploadFileRequest } from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { ApiError } from "../../src/http/ApiError.ts";
import type { UploadFileRow } from "../../src/upload/uploadSessionAccess.ts";
import {
  getCompletedTransferFromRequest,
  verifyUploadedObjects,
  type CompletedTransfer,
} from "../../src/upload/verifyUploadedObjects.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";

const HASH = "a".repeat(64);
const ORIGINAL_KEY = "uploads/session/file/original.jpg";
const THUMB_KEY = "uploads/session/file/thumb.jpg";

const makeFile = (overrides: Partial<UploadFileRow> = {}): UploadFileRow => {
  return {
    id: "file",
    upload_session_id: "session",
    item_id: null,
    position: 1,
    original_filename: "IMG_0001.jpg",
    declared_content_type: "image/jpeg",
    declared_bytes: 1024,
    content_hash: HASH,
    kind: "photo",
    storage_key: ORIGINAL_KEY,
    state: "sending",
    attempt_count: 1,
    presigned_until: NOW,
    multipart_upload_id: null,
    problem_code: null,
    problem_detail: null,
    captured_at: NOW,
    capture_date: "2026-09-27",
    capture_offset_minutes: null,
    capture_source: "upload_time",
    original_captured_at: NOW,
    width: 4032,
    height: 3024,
    duration_ms: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
};

const makeTransfer = (
  overrides: Partial<CompletedTransfer> = {},
): CompletedTransfer => {
  return {
    contentHash: HASH,
    byteSize: 1024,
    parts: null,
    width: 4032,
    height: 3024,
    durationMs: null,
    renditions: [],
    ...overrides,
  };
};

const getRefusal = (run: () => unknown): ApiError => {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a refusal");
};

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
    const failingComplete = (operation: string) => {
      if (operation === "completeMultipart") {
        throw new Error("NoSuchUpload");
      }
    };
    const healthy = createFakeB2Client();
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
    expect(healthy.calls).toEqual(["completeMultipart"]);
    expect(recovered.isVerified).toBe(true);
    await expect(
      verifyUploadedObjects({ b2: neverLanded, file, transfer }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "upload_storage_unavailable",
    });
  });

  it("fails as content_mismatch what Backblaze can never assemble, and a recovered object of the wrong size", async () => {
    const file = makeFile({
      multipart_upload_id: "upload-1",
      declared_bytes: 70_000_000,
    });
    const transfer = makeTransfer({
      byteSize: 70_000_000,
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    const refuseWith = (name: string) => {
      const b2 = createFakeB2Client();
      b2.onCall = (operation) => {
        if (operation === "completeMultipart") {
          throw Object.assign(new Error(`${name}: refused`), { name });
        }
      };
      return b2;
    };
    const wrongSize = refuseWith("NoSuchUpload");
    wrongSize.storedObjects.set(ORIGINAL_KEY, {
      sizeBytes: 69_999_999,
      contentType: "video/mp4",
    });

    const refusals = await Promise.all(
      ["InvalidPart", "InvalidPartOrder", "EntityTooSmall"].map((name) => {
        return verifyUploadedObjects({ b2: refuseWith(name), file, transfer });
      }),
    );
    const whenWrongSize = await verifyUploadedObjects({
      b2: wrongSize,
      file,
      transfer,
    });

    for (const refusal of refusals) {
      expect(refusal).toMatchObject({
        isVerified: false,
        problemCode: "content_mismatch",
      });
    }
    expect(whenWrongSize).toMatchObject({
      isVerified: false,
      problemCode: "content_mismatch",
    });
  });

  it("answers 503 when Backblaze cannot be reached", async () => {
    const b2 = createFakeB2Client();
    b2.isUnavailable = true;

    await expect(
      verifyUploadedObjects({ b2, file: makeFile(), transfer: makeTransfer() }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "upload_storage_unavailable",
    });
  });
});

describe("getCompletedTransferFromRequest", () => {
  const done = (overrides: Partial<CompleteUploadFileRequest> = {}) => {
    return {
      outcome: "done" as const,
      contentHash: HASH,
      byteSize: 1024,
      ...overrides,
    };
  };

  it("takes the dimensions from the call, or from the manifest when the call has none", () => {
    expect(
      getCompletedTransferFromRequest({
        body: done({ width: 3024, height: 4032 }),
        file: makeFile(),
      }),
    ).toMatchObject({ width: 3024, height: 4032 });
    expect(
      getCompletedTransferFromRequest({ body: done(), file: makeFile() }),
    ).toMatchObject({ width: 4032, height: 3024 });
  });

  it("ignores an original in the renditions list, and refuses transcodes and repeats", () => {
    const thumb = {
      purpose: "thumb" as const,
      byteSize: 40_000,
      width: 480,
      height: 360,
    };

    expect(
      getCompletedTransferFromRequest({
        body: done({
          renditions: [
            { purpose: "original", byteSize: 1024, width: 4032, height: 3024 },
            thumb,
          ],
        }),
        file: makeFile(),
      }).renditions,
    ).toEqual([thumb]);
    expect(
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done({ renditions: [thumb, thumb] }),
          file: makeFile(),
        });
      }).statusCode,
    ).toBe(400);
    expect(
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done({
            renditions: [
              { purpose: "video_mp4", byteSize: 1, width: 1, height: 1 },
            ],
          }),
          file: makeFile(),
        });
      }).statusCode,
    ).toBe(400);
  });

  it("refuses a done call it cannot ingest", () => {
    const refusals = [
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: { outcome: "done", byteSize: 1024 },
          file: makeFile(),
        });
      }),
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done(),
          file: makeFile({ width: null, height: null }),
        });
      }),
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done(),
          file: makeFile({ multipart_upload_id: "upload-1" }),
        });
      }),
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done({
            renditions: [
              { purpose: "thumb", byteSize: 40_000, width: null, height: null },
            ],
          }),
          file: makeFile(),
        });
      }),
    ];

    expect(
      refusals.map((refusal) => {
        return Object.keys(refusal.details?.fieldErrors ?? {});
      }),
    ).toEqual([["contentHash"], ["width"], ["parts"], ["renditions"]]);
  });

  it("takes width and height together from one source, never one from each", () => {
    const refusals = [
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done({ width: 3024 }),
          file: makeFile(),
        });
      }),
      getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done({ height: 4032, width: null }),
          file: makeFile(),
        });
      }),
    ];

    expect(
      refusals.map((refusal) => {
        return Object.keys(refusal.details?.fieldErrors ?? {});
      }),
    ).toEqual([["height"], ["width"]]);
    expect(
      getCompletedTransferFromRequest({
        body: done({ width: null, height: null }),
        file: makeFile(),
      }),
    ).toMatchObject({ width: 4032, height: 3024 });
  });

  describe("a multipart file's parts", () => {
    const partSizeBytes = appConfig.upload.multipartPartSizeBytes;
    // Two and a bit parts' worth of bytes, so three parts.
    const multipartFile = makeFile({
      multipart_upload_id: "upload-1",
      declared_bytes: partSizeBytes * 2 + 1,
    });
    const makeParts = (partNumbers: readonly number[]) => {
      return partNumbers.map((partNumber) => {
        return { partNumber, etag: `"etag-${partNumber}"` };
      });
    };
    const getPartsRefusal = (parts: CompleteUploadFileRequest["parts"]) => {
      return getRefusal(() => {
        return getCompletedTransferFromRequest({
          body: done({ parts }),
          file: multipartFile,
        });
      });
    };

    it("takes exactly parts 1 to the count the presign signed, ascending", () => {
      const transfer = getCompletedTransferFromRequest({
        body: done({ parts: makeParts([1, 2, 3]) }),
        file: multipartFile,
      });

      expect(transfer.parts).toEqual(makeParts([1, 2, 3]));
    });

    it("refuses a gap, a repeat, a wrong count, a wrong order and a blank ETag", () => {
      const refusals = [
        getPartsRefusal(makeParts([1, 2, 4])),
        getPartsRefusal(makeParts([1, 2, 2])),
        getPartsRefusal(makeParts([1, 2])),
        getPartsRefusal(makeParts([1, 2, 3, 4])),
        getPartsRefusal(makeParts([2, 1, 3])),
        getPartsRefusal([
          { partNumber: 1, etag: '"etag-1"' },
          { partNumber: 2, etag: "   " },
          { partNumber: 3, etag: '"etag-3"' },
        ]),
      ];

      expect(
        refusals.map((refusal) => {
          return [
            refusal.statusCode,
            Object.keys(refusal.details?.fieldErrors ?? {}),
          ];
        }),
      ).toEqual(
        refusals.map(() => {
          return [400, ["parts"]];
        }),
      );
    });
  });
});
