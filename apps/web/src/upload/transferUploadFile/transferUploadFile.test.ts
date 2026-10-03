import type {
  CompleteUploadFileResponse,
  PresignUploadFileResponse,
} from "@memory-shoebox/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/client/client";
import {
  getBackoffDelayMsFromAttempt,
  getPartRangesFromSize,
  getRequiredLifetimeMsFromRate,
  isPartPlanFeasible,
  type RetryPolicy,
} from "@/upload/transferUploadFile/transferPlanning";
import {
  failUploadFile,
  transferUploadFile,
  type TransferApi,
  type TransferUploadFileOptions,
} from "@/upload/transferUploadFile/transferUploadFile";
import {
  UploadNetworkError,
  type PutBytesOptions,
  type PutBytesResult,
  type UploadTransport,
} from "@/upload/transferUploadFile/uploadTransport";

const SESSION_ID = "018f0000-0000-7000-8000-00000000c001";
const FILE_ID = "018f0000-0000-7000-8000-00000000f001";
const HASH = "b".repeat(64);
const T0 = Date.parse("2026-10-02T10:00:00.000Z");
const IN_AN_HOUR = new Date(T0 + 3_600_000).toISOString();

/** A single-PUT presign for one URL. */
function _single(url: string): PresignUploadFileResponse {
  return {
    mode: "single",
    fileId: FILE_ID,
    method: "PUT",
    url,
    headers: { "Content-Type": "image/jpeg" },
    expiresAt: IN_AN_HOUR,
  };
}

/** A multipart presign for a 10-byte file, part URLs `<prefix>-<n>`. */
function _multipart(options: {
  partNumbers: readonly number[];
  prefix: string;
  expiresAt?: string;
}): PresignUploadFileResponse {
  const expiresAt = options.expiresAt ?? IN_AN_HOUR;
  return {
    mode: "multipart",
    fileId: FILE_ID,
    multipartUploadId: "upload-1",
    partSizeBytes: 4,
    partCount: 3,
    parts: options.partNumbers.map((partNumber) => {
      return { partNumber, url: `${options.prefix}-${partNumber}`, expiresAt };
    }),
    method: "PUT",
    headers: { "Content-Type": "video/quicktime" },
    expiresAt,
  };
}

/** What `complete` answers, for the state it ended in. */
function _completed(state: "done" | "failed"): CompleteUploadFileResponse {
  return {
    file: {
      fileId: FILE_ID,
      position: 0,
      originalFilename: "IMG_0001.MOV",
      declaredContentType: "video/quicktime",
      declaredBytes: 10,
      contentHash: HASH,
      state,
      attemptCount: 1,
      problemCode: null,
      problemDetail: null,
      capturedAt: null,
      capturedOn: null,
      captureOffsetMinutes: null,
      captureSource: null,
      itemId: null,
      media: null,
    },
    progress: {
      waitingCount: 0,
      sendingCount: 0,
      doneCount: state === "done" ? 1 : 0,
      failedCount: state === "failed" ? 1 : 0,
      refusedCount: 0,
      cancelledCount: 0,
      doneBytes: 0,
    },
    sessionState: "settled",
    didSettle: true,
  };
}

/** A transport that answers each PUT with the next scripted answer. */
function _scriptedTransport(
  answers: ReadonlyArray<PutBytesResult | Error>,
): UploadTransport & { calls: PutBytesOptions[] } {
  const calls: PutBytesOptions[] = [];
  return {
    calls,
    putBytes: async (options) => {
      calls.push(options);
      options.onProgress(options.body.size);
      const answer = answers[calls.length - 1] ?? { status: 200, etag: null };
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  };
}

/** An API whose presign answers in order, and whose complete succeeds. */
function _scriptedApi(
  presigns: ReadonlyArray<PresignUploadFileResponse | Error>,
): TransferApi & {
  presignUploadFile: ReturnType<typeof vi.fn>;
  completeUploadFile: ReturnType<typeof vi.fn>;
} {
  let presignCount = 0;
  return {
    presignUploadFile: vi.fn(async () => {
      presignCount += 1;
      const answer = presigns[presignCount - 1];
      if (answer === undefined) {
        throw new Error(`No presign answer ${presignCount}`);
      }
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    }),
    completeUploadFile: vi.fn(async (options) => {
      return _completed(options.body.outcome);
    }),
  };
}

/** A retry policy with a recorded, instant sleep. */
function _instantRetry(maxAttempts = 3): RetryPolicy & {
  sleep: ReturnType<typeof vi.fn>;
} {
  return {
    maxAttempts,
    baseDelayMs: 1000,
    maxDelayMs: 16_000,
    sleep: vi.fn(async () => {}),
  };
}

/** Options for one 10-byte file, with whatever the test overrides. */
function _options(
  overrides: Partial<TransferUploadFileOptions> &
    Pick<TransferUploadFileOptions, "api" | "transport">,
): TransferUploadFileOptions {
  return {
    sessionId: SESSION_ID,
    fileId: FILE_ID,
    file: new Blob([new Uint8Array(10).fill(1)]),
    contentHash: HASH,
    derivatives: [],
    size: { width: 1080, height: 1920 },
    durationMs: 12_000,
    signal: new AbortController().signal,
    onProgress: () => {},
    retry: _instantRetry(),
    now: () => {
      return T0;
    },
    ...overrides,
  };
}

/** The URLs a transport was asked to PUT to, in order. */
function _urlsOf(transport: { calls: PutBytesOptions[] }): string[] {
  return transport.calls.map((call) => {
    return call.url;
  });
}

describe("getPartRangesFromSize", () => {
  it("cuts the last part short", () => {
    expect(getPartRangesFromSize({ byteSize: 10, partSizeBytes: 4 })).toEqual([
      { partNumber: 1, start: 0, end: 4 },
      { partNumber: 2, start: 4, end: 8 },
      { partNumber: 3, start: 8, end: 10 },
    ]);
  });

  it("makes whole parts of an exact multiple, and none of nothing", () => {
    expect(
      getPartRangesFromSize({ byteSize: 8, partSizeBytes: 4 }),
    ).toHaveLength(2);
    expect(getPartRangesFromSize({ byteSize: 0, partSizeBytes: 4 })).toEqual(
      [],
    );
  });
});

describe("getRequiredLifetimeMsFromRate", () => {
  it("plans for the floor before anything has been measured", () => {
    expect(
      getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: null,
      }),
    ).toBe(1_546_000);
  });

  it("plans for the measured rate when the link is faster", () => {
    expect(
      getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: 2 * 1024 * 1024,
      }),
    ).toBe(22_000);
  });

  it("never plans below the floor, so a fresh URL always suffices", () => {
    expect(
      getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: 10,
      }),
    ).toBe(1_546_000);
    expect(isPartPlanFeasible()).toBe(true);
    expect(
      isPartPlanFeasible({
        partSizeBytes: 16 * 1024 * 1024,
        presignTtlSeconds: 600,
      }),
    ).toBe(false);
  });
});

describe("the floor rate", () => {
  it("is the configured floor, not a figure of the planner's own", async () => {
    vi.resetModules();
    vi.doMock("../../../../../app.config", async (importOriginal) => {
      const original =
        await importOriginal<typeof import("../../../../../app.config")>();
      return {
        appConfig: {
          ...original.appConfig,
          upload: {
            ...original.appConfig.upload,
            transferFloorBytesPerSecond: 32 * 1024,
          },
        },
      };
    });

    const planning =
      await import("@/upload/transferUploadFile/transferPlanning");

    // 16 MiB at a doubled floor of 32 KiB/s: 512 s, half again, plus 10 s.
    expect(planning.FLOOR_BYTES_PER_SECOND).toBe(32 * 1024);
    expect(
      planning.getRequiredLifetimeMsFromRate({
        partBytes: 16 * 1024 * 1024,
        measuredBytesPerSecond: null,
      }),
    ).toBe(778_000);
    vi.doUnmock("../../../../../app.config");
    vi.resetModules();
  });
});

describe("getBackoffDelayMsFromAttempt", () => {
  it("doubles from the base and stops at the cap", () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((attempt) => {
        return getBackoffDelayMsFromAttempt({
          attempt,
          baseDelayMs: 1000,
          maxDelayMs: 16_000,
        });
      }),
    ).toEqual([1000, 2000, 4000, 8000, 16_000, 16_000]);
  });
});

describe("transferUploadFile", () => {
  it("PUTs the file and each derivative, then completes with all of it", async () => {
    const api = _scriptedApi([
      _single("https://b2/original"),
      _single("https://b2/display"),
      _single("https://b2/thumb"),
    ]);
    const transport = _scriptedTransport([]);

    const outcome = await transferUploadFile(
      _options({
        api,
        transport,
        durationMs: null,
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
    expect(_urlsOf(transport)).toEqual([
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
        durationMs: null,
        renditions: [
          { purpose: "display", byteSize: 3, width: 1152, height: 2048 },
          { purpose: "thumb", byteSize: 2, width: 270, height: 480 },
        ],
      },
    });
  });

  it("sends the parts in order and completes with their ETags", async () => {
    const api = _scriptedApi([
      _multipart({ partNumbers: [1, 2, 3], prefix: "part" }),
    ]);
    const transport = _scriptedTransport([
      { status: 200, etag: '"e1"' },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);

    const outcome = await transferUploadFile(_options({ api, transport }));

    expect(outcome.outcome).toBe("done");
    expect(_urlsOf(transport)).toEqual(["part-1", "part-2", "part-3"]);
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
    const api = _scriptedApi([
      _multipart({ partNumbers: [1, 2, 3], prefix: "old" }),
      _multipart({ partNumbers: [2], prefix: "new" }),
    ]);
    const transport = _scriptedTransport([
      { status: 200, etag: '"e1"' },
      { status: 403, etag: null },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);

    const outcome = await transferUploadFile(_options({ api, transport }));

    expect(outcome.outcome).toBe("done");
    expect(api.presignUploadFile.mock.calls[1]?.[0].body).toEqual({
      contentHash: HASH,
      purpose: "original",
      byteSize: 10,
      partNumbers: [2],
    });
    expect(_urlsOf(transport)).toEqual(["old-1", "old-2", "new-2", "old-3"]);
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.parts).toEqual([
      { partNumber: 1, etag: '"e1"' },
      { partNumber: 2, etag: '"e2"' },
      { partNumber: 3, etag: '"e3"' },
    ]);
  });

  it("re-presigns every part still to go before a URL can expire under one", async () => {
    const api = _scriptedApi([
      _multipart({
        partNumbers: [1, 2, 3],
        prefix: "stale",
        expiresAt: new Date(T0 + 5000).toISOString(),
      }),
      _multipart({ partNumbers: [1, 2, 3], prefix: "fresh" }),
    ]);
    const transport = _scriptedTransport([
      { status: 200, etag: '"e1"' },
      { status: 200, etag: '"e2"' },
      { status: 200, etag: '"e3"' },
    ]);

    await transferUploadFile(_options({ api, transport }));

    expect(api.presignUploadFile.mock.calls[1]?.[0].body.partNumbers).toEqual([
      1, 2, 3,
    ]);
    expect(_urlsOf(transport)).toEqual(["fresh-1", "fresh-2", "fresh-3"]);
  });

  it("fails the file naming CORS when a part's ETag cannot be read", async () => {
    const api = _scriptedApi([
      _multipart({ partNumbers: [1, 2, 3], prefix: "part" }),
    ]);
    const transport = _scriptedTransport([{ status: 200, etag: null }]);

    const outcome = await transferUploadFile(_options({ api, transport }));

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "storage_rejected",
    });
    expect(outcome.outcome === "failed" ? outcome.detail : "").toContain(
      "CORS",
    );
    expect(api.completeUploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          outcome: "failed",
          problemCode: "storage_rejected",
        }),
      }),
    );
  });

  it("treats a blank ETag as unreadable, since complete refuses one", async () => {
    const api = _scriptedApi([
      _multipart({ partNumbers: [1, 2, 3], prefix: "part" }),
    ]);
    const transport = _scriptedTransport([{ status: 200, etag: "  " }]);

    const outcome = await transferUploadFile(_options({ api, transport }));

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "storage_rejected",
    });
    expect(transport.calls).toHaveLength(1);
  });

  it("sends the width and the height together, or neither", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);

    await transferUploadFile(
      _options({ api, transport: _scriptedTransport([]), size: null }),
    );

    const body = api.completeUploadFile.mock.calls[0]?.[0].body;
    expect(body).toMatchObject({ width: null, height: null });
  });

  it("tries complete again on a 503, after the backoff", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);
    api.completeUploadFile.mockRejectedValueOnce(
      new ApiRequestError({
        status: 503,
        code: "upload_storage_unavailable",
        message: "Backblaze is down.",
      }),
    );
    const retry = _instantRetry();

    const outcome = await transferUploadFile(
      _options({ api, transport: _scriptedTransport([]), retry }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.completeUploadFile).toHaveBeenCalledTimes(2);
    expect(retry.sleep).toHaveBeenCalledWith(1000);
  });

  it("tries a PUT again after Backblaze's own 503", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);
    const transport = _scriptedTransport([
      { status: 503, etag: null },
      { status: 200, etag: null },
    ]);

    const outcome = await transferUploadFile(_options({ api, transport }));

    expect(outcome.outcome).toBe("done");
    expect(transport.calls).toHaveLength(2);
  });

  it("gives up after the last try, and completes the file as failed", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = _scriptedTransport([lost, lost, lost]);
    const retry = _instantRetry(3);

    const outcome = await transferUploadFile(
      _options({ api, transport, retry }),
    );

    expect(transport.calls).toHaveLength(3);
    expect(retry.sleep.mock.calls).toEqual([[1000], [2000]]);
    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
      response: { file: { state: "failed" } },
    });
    expect(api.completeUploadFile).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      body: {
        outcome: "failed",
        problemCode: "connection_lost",
        problemDetail: "UploadNetworkError: The PUT to storage got no answer",
      },
    });
  });

  it("drops a derivative that will not land, and still completes the file", async () => {
    const api = _scriptedApi([
      _single("https://b2/original"),
      _single("https://b2/thumb"),
    ]);
    const transport = _scriptedTransport([
      { status: 200, etag: null },
      { status: 400, etag: null },
    ]);

    const outcome = await transferUploadFile(
      _options({
        api,
        transport,
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

    expect(outcome.outcome).toBe("done");
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.renditions).toEqual(
      [],
    );
  });

  it("skips a file presign cancelled as a duplicate, and completes nothing", async () => {
    const api = _scriptedApi([
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "These bytes are already in this batch.",
        details: {
          fileId: "018f0000-0000-7000-8000-00000000f002",
          state: "cancelled",
        },
      }),
    ]);
    const transport = _scriptedTransport([]);

    const outcome = await transferUploadFile(_options({ api, transport }));

    expect(outcome).toEqual({
      outcome: "skipped",
      reason: "duplicate",
      holderFileId: "018f0000-0000-7000-8000-00000000f002",
    });
    expect(transport.calls).toHaveLength(0);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("stops quietly when the batch was closed under the file", async () => {
    const api = _scriptedApi([
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "This file is cancelled.",
        details: { state: "cancelled" },
      }),
    ]);

    const outcome = await transferUploadFile(
      _options({ api, transport: _scriptedTransport([]) }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("does not complete again when the server already failed the row", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);
    api.completeUploadFile.mockRejectedValueOnce(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "The hash disagrees with what was presigned.",
      }),
    );

    const outcome = await transferUploadFile(
      _options({ api, transport: _scriptedTransport([]) }),
    );

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "checksum_mismatch",
      response: null,
    });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
  });

  it("does not try complete again when the server refused the object", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);
    api.completeUploadFile.mockRejectedValue(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "The bucket holds a different object.",
        details: { state: "failed" },
      }),
    );
    const retry = _instantRetry();

    const outcome = await transferUploadFile(
      _options({ api, transport: _scriptedTransport([]), retry }),
    );

    expect(outcome).toMatchObject({ outcome: "failed", response: null });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(retry.sleep).not.toHaveBeenCalled();
  });

  it("presigns again when another presign of the file won the race", async () => {
    const lostRace = new ApiRequestError({
      status: 409,
      code: "upload_file_conflict",
      message: "Another presign of this file got there first.",
      details: { state: "sending" },
    });
    const api = _scriptedApi([lostRace, _single("https://b2/original")]);
    const transport = _scriptedTransport([]);
    const retry = _instantRetry();

    const outcome = await transferUploadFile(
      _options({ api, transport, retry }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.presignUploadFile).toHaveBeenCalledTimes(2);
    expect(retry.sleep).toHaveBeenCalledWith(1000);
    expect(_urlsOf(transport)).toEqual(["https://b2/original"]);
  });

  it("gives up on a presign that keeps losing the race", async () => {
    const lostRace = new ApiRequestError({
      status: 409,
      code: "upload_file_conflict",
      message: "Another presign of this file got there first.",
      details: { state: "sending" },
    });
    const api = _scriptedApi([lostRace, lostRace, lostRace]);
    const transport = _scriptedTransport([]);
    const retry = _instantRetry(3);

    const outcome = await transferUploadFile(
      _options({ api, transport, retry }),
    );

    expect(api.presignUploadFile).toHaveBeenCalledTimes(3);
    expect(retry.sleep.mock.calls).toEqual([[1000], [2000]]);
    expect(transport.calls).toHaveLength(0);
    expect(outcome).toMatchObject({ outcome: "failed" });
  });

  it("does not presign again for a 409 on complete, even one that says sending", async () => {
    const api = _scriptedApi([_single("https://b2/original")]);
    api.completeUploadFile.mockRejectedValue(
      new ApiRequestError({
        status: 409,
        code: "upload_file_conflict",
        message: "The row moved while it was verified.",
        details: { state: "sending" },
      }),
    );
    const retry = _instantRetry();

    await transferUploadFile(
      _options({ api, transport: _scriptedTransport([]), retry }),
    );

    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    expect(retry.sleep).not.toHaveBeenCalled();
  });

  it("reports nothing and completes nothing when cancelled mid-PUT", async () => {
    const controller = new AbortController();
    const api = _scriptedApi([_single("https://b2/original")]);
    const transport: UploadTransport = {
      putBytes: async () => {
        controller.abort();
        throw new DOMException("The upload was cancelled", "AbortError");
      },
    };

    const outcome = await transferUploadFile(
      _options({ api, transport, signal: controller.signal }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("reports progress over the original and the derivatives together", async () => {
    const api = _scriptedApi([
      _single("https://b2/original"),
      _single("https://b2/thumb"),
    ]);
    const onProgress = vi.fn();

    await transferUploadFile(
      _options({
        api,
        transport: _scriptedTransport([]),
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

describe("failUploadFile", () => {
  it("completes a file that never reached a transfer as failed", async () => {
    const api = _scriptedApi([]);

    const outcome = await failUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      api,
      signal: new AbortController().signal,
      problemCode: "connection_lost",
      detail: "NotReadableError: The file is gone.",
      retry: _instantRetry(),
    });

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
      response: { file: { state: "failed" } },
    });
    expect(api.presignUploadFile).not.toHaveBeenCalled();
  });

  it("sends nothing after a cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const api = _scriptedApi([]);

    const outcome = await failUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      api,
      signal: controller.signal,
      problemCode: "connection_lost",
      detail: "gone",
    });

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });
});
