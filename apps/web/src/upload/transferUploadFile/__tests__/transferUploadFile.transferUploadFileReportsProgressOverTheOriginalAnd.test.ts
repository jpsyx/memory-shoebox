import {
  HASH,
  makeSinglePresignFromOverrides,
  makeMultipartPresignFromOverrides,
  makeUploadTransportFromAnswers,
  makeUploadApiFromAnswers,
  makeTransferOptionsFromOverrides,
  getUrlsFromTransport,
} from "./transferUploadFileTestHelpers";

import { describe, expect, it, vi } from "vitest";

import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";

import { type UploadTransport } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("transferUploadFile", () => {
  it("reports progress over the original and the derivatives together", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      makeSinglePresignFromOverrides("https://b2/thumb"),
    ]);
    const onProgress = vi.fn();

    await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        onProgress,
        derivatives: [
          {
            purpose: "thumb",
            blob: new Blob([new Uint8Array(2)]),
            width: 270,
            height: 480,
          },
        ],
      }),
    );

    expect(onProgress.mock.calls).toEqual([
      [{ sentBytes: 10, totalBytes: 12 }],
      [{ sentBytes: 12, totalBytes: 12 }],
    ]);
  });
});

describe("transferUploadFile when a presigned URL has expired", () => {
  const thumb = {
    purpose: "thumb",
    blob: new Blob([new Uint8Array(2)]),
    width: 270,
    height: 480,
  } as const;

  it("re-presigns only the part that met Backblaze's 401, and sends it again", async () => {
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "old",
      }),
      makeMultipartPresignFromOverrides({ partNumbers: [2], prefix: "new" }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      { status: 401, etag: undefined },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.presignUploadFile.mock.calls[1]?.[0].body).toEqual({
      contentHash: HASH,
      purpose: "original",
      byteSize: 10,
      partNumbers: [2],
    });
    expect(getUrlsFromTransport(transport)).toEqual([
      "old-1",
      "old-2",
      "new-2",
      "old-3",
    ]);
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.parts).toEqual([
      { partNumber: 1, etag: '"e1"' },
      { partNumber: 2, etag: '"e2"' },
      { partNumber: 3, etag: '"e3"' },
    ]);
  });

  it.each([401, 403])(
    "presigns a single PUT again after a %i, and sends it again",
    async (status) => {
      const api = makeUploadApiFromAnswers([
        makeSinglePresignFromOverrides("https://b2/stale"),
        makeSinglePresignFromOverrides("https://b2/fresh"),
      ]);
      const transport = makeUploadTransportFromAnswers([
        { status, etag: undefined },
        { status: 200, etag: undefined },
      ]);

      const outcome = await transferUploadFile(
        makeTransferOptionsFromOverrides({ api, transport }),
      );

      expect(outcome.outcome).toBe("done");
      expect(api.presignUploadFile.mock.calls[1]?.[0].body).toEqual({
        contentHash: HASH,
        purpose: "original",
        byteSize: 10,
      });
      expect(getUrlsFromTransport(transport)).toEqual([
        "https://b2/stale",
        "https://b2/fresh",
      ]);
    },
  );

  it.each([401, 403])(
    "presigns a derivative again after a %i, and keeps it",
    async (status) => {
      const api = makeUploadApiFromAnswers([
        makeSinglePresignFromOverrides("https://b2/original"),
        makeSinglePresignFromOverrides("https://b2/stale-thumb"),
        makeSinglePresignFromOverrides("https://b2/fresh-thumb"),
      ]);
      const transport = makeUploadTransportFromAnswers([
        { status: 200, etag: undefined },
        { status, etag: undefined },
        { status: 200, etag: undefined },
      ]);

      const outcome = await transferUploadFile(
        makeTransferOptionsFromOverrides({
          api,
          transport,
          derivatives: [thumb],
        }),
      );

      expect(outcome.outcome).toBe("done");
      expect(api.presignUploadFile.mock.calls[2]?.[0].body).toEqual({
        contentHash: HASH,
        purpose: "thumb",
        byteSize: 10,
      });
      expect(getUrlsFromTransport(transport)).toEqual([
        "https://b2/original",
        "https://b2/stale-thumb",
        "https://b2/fresh-thumb",
      ]);
      expect(api.completeUploadFile.mock.calls[0]?.[0].body.renditions).toEqual(
        [{ purpose: "thumb", byteSize: 2, width: 270, height: 480 }],
      );
    },
  );

  it.each([401, 403])(
    "gives up when the fresh URL is refused with a %i too",
    async (status) => {
      const api = makeUploadApiFromAnswers([
        makeSinglePresignFromOverrides("https://b2/stale"),
        makeSinglePresignFromOverrides("https://b2/fresh"),
      ]);
      const transport = makeUploadTransportFromAnswers([
        { status, etag: undefined },
        { status, etag: undefined },
      ]);

      const outcome = await transferUploadFile(
        makeTransferOptionsFromOverrides({ api, transport }),
      );

      expect(outcome).toMatchObject({
        outcome: "failed",
        problemCode: "storage_rejected",
        detail: `Storage answered ${status}`,
      });
      expect(api.presignUploadFile).toHaveBeenCalledTimes(2);
      expect(transport.calls).toHaveLength(2);
    },
  );
});

describe("transferUploadFile progress", () => {
  it("never reports less than it already has, across a retry", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    let putCount = 0;
    const transport: UploadTransport = {
      putBytes: async (options) => {
        putCount += 1;
        if (putCount === 1) {
          options.onProgress(6);
          return { status: 503, etag: undefined };
        }
        options.onProgress(2);
        options.onProgress(10);
        return { status: 200, etag: undefined };
      },
    };
    const onProgress = vi.fn();

    await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, onProgress }),
    );

    expect(
      onProgress.mock.calls.map(([progress]) => {
        return progress.sentBytes;
      }),
    ).toEqual([6, 6, 10]);
  });

  it("stops counting a dropped derivative, so the file can reach 100%", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      makeSinglePresignFromOverrides("https://b2/thumb"),
    ]);
    let putCount = 0;
    const transport: UploadTransport = {
      putBytes: async (options) => {
        putCount += 1;
        if (putCount === 1) {
          options.onProgress(10);
          return { status: 200, etag: undefined };
        }
        return { status: 400, etag: undefined };
      },
    };
    const onProgress = vi.fn();

    await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        onProgress,
        derivatives: [
          {
            purpose: "thumb",
            blob: new Blob([new Uint8Array(2)]),
            width: 270,
            height: 480,
          },
        ],
      }),
    );

    expect(onProgress.mock.calls).toEqual([
      [{ sentBytes: 10, totalBytes: 12 }],
      [{ sentBytes: 10, totalBytes: 10 }],
    ]);
  });
});
