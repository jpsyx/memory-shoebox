import {
  SESSION_ID,
  FILE_ID,
  HASH,
  T0,
  makeSinglePresignFromOverrides,
  makeMultipartPresignFromOverrides,
  makeUploadTransportFromAnswers,
  makeUploadApiFromAnswers,
  makeTransferOptionsFromOverrides,
  getUrlsFromTransport,
} from "./transferUploadFileTestHelpers";

import { describe, expect, it } from "vitest";

import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";

import {
  UploadNetworkError,
  type UploadTransport,
} from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("transferUploadFile", () => {
  it("PUTs the file and each derivative, then completes with all of it", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      makeSinglePresignFromOverrides("https://b2/display"),
      makeSinglePresignFromOverrides("https://b2/thumb"),
    ]);
    const transport = makeUploadTransportFromAnswers([]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        durationMs: undefined,
        derivatives: [
          {
            purpose: "display",
            blob: new Blob([new Uint8Array(3)]),
            width: 1152,
            height: 2048,
          },
          {
            purpose: "thumb",
            blob: new Blob([new Uint8Array(2)]),
            width: 270,
            height: 480,
          },
        ],
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(
      api.presignUploadFile.mock.calls.map(([call]) => {
        return call.body;
      }),
    ).toEqual([
      { contentHash: HASH, purpose: "original", byteSize: 10 },
      { contentHash: HASH, purpose: "display", byteSize: 10 },
      { contentHash: HASH, purpose: "thumb", byteSize: 10 },
    ]);
    expect(getUrlsFromTransport(transport)).toEqual([
      "https://b2/original",
      "https://b2/display",
      "https://b2/thumb",
    ]);
    expect(transport.calls[0]?.headers).toEqual({
      "Content-Type": "image/jpeg",
    });
    expect(api.completeUploadFile).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: {
        outcome: "done",
        contentHash: HASH,
        byteSize: 10,
        width: 1080,
        height: 1920,
        durationMs: undefined,
        renditions: [
          { purpose: "display", byteSize: 3, width: 1152, height: 2048 },
          { purpose: "thumb", byteSize: 2, width: 270, height: 480 },
        ],
      },
    });
  });

  it("sends the parts in order and completes with their ETags", async () => {
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "part",
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(outcome.outcome).toBe("done");
    expect(getUrlsFromTransport(transport)).toEqual([
      "part-1",
      "part-2",
      "part-3",
    ]);
    expect(
      transport.calls.map((call) => {
        return call.body.size;
      }),
    ).toEqual([4, 4, 2]);
    expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.parts).toEqual([
      { partNumber: 1, etag: '"e1"' },
      { partNumber: 2, etag: '"e2"' },
      { partNumber: 3, etag: '"e3"' },
    ]);
  });

  it("re-presigns only the part that met a 403, and sends it again", async () => {
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "old",
      }),
      makeMultipartPresignFromOverrides({ partNumbers: [2], prefix: "new" }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      { status: 403, etag: undefined },
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

  it("re-presigns every part still to go once a URL is about to lapse", async () => {
    let clock = T0;
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "stale",
      }),
      makeMultipartPresignFromOverrides({
        partNumbers: [2, 3],
        prefix: "fresh",
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);
    const slowTransport: UploadTransport = {
      putBytes: (options) => {
        // The first part takes all but five seconds of the URLs' hour.
        clock += options.url === "stale-1" ? 3_595_000 : 0;
        return transport.putBytes(options);
      },
    };

    await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: slowTransport,
        now: () => {
          return clock;
        },
      }),
    );

    expect(api.presignUploadFile.mock.calls[1]?.[0].body.partNumbers).toEqual([
      2, 3,
    ]);
    expect(getUrlsFromTransport(transport)).toEqual([
      "stale-1",
      "fresh-2",
      "fresh-3",
    ]);
  });

  it("re-presigns a single PUT before retrying it on a URL that would lapse first", async () => {
    let clock = T0;
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      makeSinglePresignFromOverrides("https://b2/fresh"),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 503, etag: undefined },
      { status: 200, etag: undefined },
    ]);
    const slowTransport: UploadTransport = {
      putBytes: (options) => {
        // The first try uses all but five seconds of the URL's hour.
        clock += options.url === "https://b2/original" ? 3_595_000 : 0;
        return transport.putBytes(options);
      },
    };

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: slowTransport,
        now: () => {
          return clock;
        },
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(getUrlsFromTransport(transport)).toEqual([
      "https://b2/original",
      "https://b2/fresh",
    ]);
    expect(api.presignUploadFile.mock.calls[1]?.[0].body).toEqual({
      contentHash: HASH,
      purpose: "original",
      byteSize: 10,
    });
  });

  it("re-presigns a part before retrying it on a URL that would lapse first", async () => {
    let clock = T0;
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "old",
      }),
      makeMultipartPresignFromOverrides({ partNumbers: [2], prefix: "new" }),
      makeMultipartPresignFromOverrides({ partNumbers: [3], prefix: "new" }),
    ]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      lost,
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);
    const slowTransport: UploadTransport = {
      putBytes: (options) => {
        // Part 2's first try stalls until five seconds are left.
        clock += transport.calls.length === 1 ? 3_595_000 : 0;
        return transport.putBytes(options);
      },
    };

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: slowTransport,
        now: () => {
          return clock;
        },
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.presignUploadFile.mock.calls[1]?.[0].body.partNumbers).toEqual([
      2,
    ]);
    // Part 3's URL is as old, so it is renewed before its first try.
    expect(getUrlsFromTransport(transport)).toEqual([
      "old-1",
      "old-2",
      "new-2",
      "new-3",
    ]);
  });

  it("is not fooled by a client clock that disagrees with the server's", async () => {
    // The server's `expiresAt` is a year behind this browser's clock. Judged
    // against it, every part would be re-presigned before it was sent.
    const api = makeUploadApiFromAnswers([
      makeMultipartPresignFromOverrides({
        partNumbers: [1, 2, 3],
        prefix: "part",
        expiresAt: "2025-10-02T10:00:00.000Z",
      }),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 200, etag: '"e1"' },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);

    await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport }),
    );

    expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
    expect(getUrlsFromTransport(transport)).toEqual([
      "part-1",
      "part-2",
      "part-3",
    ]);
  });
});
