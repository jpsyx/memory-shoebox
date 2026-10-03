import {
  HASH,
  ORIGINAL_KEY,
  makeFile,
  makeTransfer,
  getRefusal,
} from "./verifyUploadedObjectsTestHelpers.ts";
import { describe, expect, it } from "vitest";
import type { CompleteUploadFileRequest } from "@memory-shoebox/shared";
import { appConfig } from "../../../../../../app.config.ts";

import { getCompletedTransferFromRequest } from "../../../../src/upload/verifyUploadedObjects/getCompletedTransferFromRequest.ts";
import { verifyUploadedObjects } from "../../../../src/upload/verifyUploadedObjects/verifyUploadedObjects.ts";

import { createFakeB2Client } from "../../../helpers/createFakeB2Client/createFakeB2Client.ts";

describe("verifyUploadedObjects", () => {
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

    refusals.forEach((refusal) => {
      expect(refusal).toMatchObject({
        isVerified: false,
        problemCode: "content_mismatch",
      });
    });
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

  it("refuses a derivative larger than the derivative cap, before any network", () => {
    const maxBytes = appConfig.upload.derivatives.maxBytes;
    const display = (byteSize: number) => {
      return {
        purpose: "display" as const,
        byteSize,
        width: 2048,
        height: 1536,
      };
    };

    expect(
      getCompletedTransferFromRequest({
        body: done({ renditions: [display(maxBytes)] }),
        file: makeFile(),
      }).renditions,
    ).toEqual([display(maxBytes)]);
    const refusal = getRefusal(() => {
      return getCompletedTransferFromRequest({
        body: done({ renditions: [display(maxBytes + 1)] }),
        file: makeFile(),
      });
    });
    expect(refusal.statusCode).toBe(400);
    expect(refusal.code).toBe("invalid_request");
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
