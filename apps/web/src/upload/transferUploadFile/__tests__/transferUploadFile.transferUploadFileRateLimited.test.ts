import {
  makeSinglePresignFromOverrides,
  makeCompleteResponseFromOverrides,
  makeUploadTransportFromAnswers,
  makeUploadApiFromAnswers,
  makeInstantRetryPolicyFromAttempts,
  getSleptMsFromRetryPolicy,
  makeTransferOptionsFromOverrides,
} from "./transferUploadFileTestHelpers";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  getRateLimitWaitMsFromRetryAfter,
  OFFLINE_WAIT_CEILING_MS,
  RATE_LIMIT_MAX_WAIT_MS,
  RATE_LIMIT_MAX_WAITS,
} from "@/upload/transferUploadFile/transferPlanningHelpers";

import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";

import { UploadNetworkError } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("transferUploadFile rate limited", () => {
  // The server's 429, asking for `retryAfterSeconds` of quiet.
  const _rateLimited = (retryAfterSeconds?: number): ApiRequestError => {
    return new ApiRequestError({
      status: 429,
      code: "rate_limited",
      message: "Too many requests.",
      ...(retryAfterSeconds === undefined
        ? {}
        : { details: { retryAfterSeconds } }),
    });
  };

  it("waits out a 429 on presign for retryAfterSeconds, spending no try", async () => {
    const api = makeUploadApiFromAnswers([
      _rateLimited(7),
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    // One try in all: a 429 that spent it would fail the file.
    const retry = makeInstantRetryPolicyFromAttempts(1);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([7000]);
    expect(api.presignUploadFile).toHaveBeenCalledTimes(2);
  });

  it("waits out a 429 on complete, rather than failing the file", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValueOnce(_rateLimited(3));
    const retry = makeInstantRetryPolicyFromAttempts(1);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([3000]);
    expect(api.completeUploadFile).toHaveBeenCalledTimes(2);
  });

  it("waits out a 429 on a derivative's presign, rather than dropping it", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
      _rateLimited(2),
      makeSinglePresignFromOverrides("https://b2/thumb"),
    ]);
    const retry = makeInstantRetryPolicyFromAttempts(1);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
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
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([2000]);
    expect(api.completeUploadFile.mock.calls[0]?.[0].body.renditions).toEqual([
      { purpose: "thumb", byteSize: 2, width: 270, height: 480 },
    ]);
  });

  it("waits no longer than a minute, and at least a second", async () => {
    const api = makeUploadApiFromAnswers([
      _rateLimited(3600),
      _rateLimited(),
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const retry = makeInstantRetryPolicyFromAttempts(1);

    await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
      }),
    );

    expect(getSleptMsFromRetryPolicy(retry)).toEqual([60_000, 1000]);
  });

  it("gives up after a bounded number of 429s, and fails the file", async () => {
    const api = makeUploadApiFromAnswers(
      Array.from({ length: 20 }, () => {
        return _rateLimited(1);
      }),
    );
    const retry = makeInstantRetryPolicyFromAttempts(3);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
      }),
    );

    expect(outcome).toMatchObject({ outcome: "failed" });
    expect(api.presignUploadFile).toHaveBeenCalledTimes(
      RATE_LIMIT_MAX_WAITS + 1,
    );
    expect(retry.sleep).toHaveBeenCalledTimes(RATE_LIMIT_MAX_WAITS);
  });
});

describe("getRateLimitWaitMsFromRetryAfter", () => {
  it("is the server's figure, between a second and the ceiling", () => {
    expect(getRateLimitWaitMsFromRetryAfter(12)).toBe(12_000);
    expect(getRateLimitWaitMsFromRetryAfter(0)).toBe(1000);
    expect(getRateLimitWaitMsFromRetryAfter(undefined)).toBe(1000);
    expect(getRateLimitWaitMsFromRetryAfter(3600)).toBe(RATE_LIMIT_MAX_WAIT_MS);
  });
});

describe("transferUploadFile while the browser is offline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Says the browser is offline until the returned spy says otherwise.
  const _goOffline = (): ReturnType<typeof vi.spyOn> => {
    return vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
  };

  // Brings the browser back on the next task, the way it does: `onLine`
  // turns true and `online` fires on the window.
  const _comeBackOnlineSoon = (onLine: ReturnType<typeof vi.spyOn>): void => {
    setTimeout(() => {
      onLine.mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    }, 0);
  };

  it("waits for the browser to come back before sending a PUT again, spending no try", async () => {
    const onLine = _goOffline();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([
      lost,
      { status: 200, etag: undefined },
    ]);
    const putBytes = transport.putBytes;
    transport.putBytes = async (options) => {
      if (transport.calls.length === 0) {
        _comeBackOnlineSoon(onLine);
      }
      return putBytes(options);
    };
    // One try in all: a wait that spent it would fail the file.
    const retry = makeInstantRetryPolicyFromAttempts(1);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, retry }),
    );

    expect(outcome.outcome).toBe("done");
    expect(transport.calls).toHaveLength(2);
    expect(retry.sleep).not.toHaveBeenCalled();
  });

  it("waits for the browser to come back before calling the API again", async () => {
    const onLine = _goOffline();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.presignUploadFile.mockImplementationOnce(async () => {
      _comeBackOnlineSoon(onLine);
      throw new TypeError("Failed to fetch");
    });
    const retry = makeInstantRetryPolicyFromAttempts(1);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        retry,
      }),
    );

    expect(outcome.outcome).toBe("done");
    expect(api.presignUploadFile).toHaveBeenCalledTimes(2);
    expect(retry.sleep).not.toHaveBeenCalled();
  });

  it("stops waiting at the ceiling, then backs off and gives up as before", async () => {
    vi.useFakeTimers();
    _goOffline();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([lost, lost, lost, lost]);
    const retry = makeInstantRetryPolicyFromAttempts(2);

    const pending = transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, retry }),
    );
    await vi.advanceTimersByTimeAsync(OFFLINE_WAIT_CEILING_MS - 1);
    expect(transport.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const outcome = await pending;

    // The PUT that failed, one more once the wait ran out, and the backoff's.
    expect(transport.calls).toHaveLength(3);
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([1000]);
    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
    });
  });

  it("gives the failure report a budget of its own, so a give-up after a long outage is recorded", async () => {
    vi.useFakeTimers();
    const onLine = _goOffline();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockImplementation(async (options) => {
      if (!window.navigator.onLine) {
        throw new TypeError("Failed to fetch");
      }
      return makeCompleteResponseFromOverrides(options.body.outcome);
    });
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([lost, lost, lost, lost]);

    const pending = transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        retry: makeInstantRetryPolicyFromAttempts(2),
      }),
    );
    await vi.advanceTimersByTimeAsync(OFFLINE_WAIT_CEILING_MS);
    // The file spent its budget and gave up; its report waits for the network
    // rather than giving up at once and leaving the row `sending`.
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    const outcome = await pending;

    expect(outcome).toMatchObject({
      outcome: "failed",
      problemCode: "connection_lost",
      response: { file: { state: "failed" } },
    });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(2);
  });

  it("stops waiting, and sends nothing more, when the transfer is cancelled", async () => {
    _goOffline();
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([lost]);
    const putBytes = transport.putBytes;
    transport.putBytes = async (options) => {
      setTimeout(() => {
        controller.abort();
      }, 0);
      return putBytes(options);
    };

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        signal: controller.signal,
      }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(transport.calls).toHaveLength(1);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("keeps the capped backoff for a failure while online", async () => {
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const lost = new UploadNetworkError("The PUT to storage got no answer");
    const transport = makeUploadTransportFromAnswers([
      lost,
      { status: 200, etag: undefined },
    ]);
    const retry = makeInstantRetryPolicyFromAttempts(2);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({ api, transport, retry }),
    );

    expect(outcome.outcome).toBe("done");
    expect(getSleptMsFromRetryPolicy(retry)).toEqual([1000]);
  });
});
