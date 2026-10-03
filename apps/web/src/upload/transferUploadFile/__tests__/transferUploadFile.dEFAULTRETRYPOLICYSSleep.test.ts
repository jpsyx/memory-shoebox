import {
  SESSION_ID,
  FILE_ID,
  makeSinglePresignFromOverrides,
  makeUploadTransportFromAnswers,
  makeUploadApiFromAnswers,
  makeInstantRetryPolicyFromAttempts,
  makeTransferOptionsFromOverrides,
} from "./transferUploadFileTestHelpers";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
} from "@/upload/transferUploadFile/transferPlanningHelpers";
import { failUploadFile } from "@/upload/transferUploadFile/failUploadFile";
import { transferUploadFile } from "@/upload/transferUploadFile/transferUploadFile";

import { UploadNetworkError } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

describe("DEFAULT_RETRY_POLICY's sleep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends at once when the signal aborts, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let isAwake = false;

    const sleeping = DEFAULT_RETRY_POLICY.sleep({
      delayMs: 60_000,
      signal: controller.signal,
    }).then(() => {
      isAwake = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(isAwake).toBe(false);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(isAwake).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await sleeping;
  });

  it("returns a transfer cancelled during a 429's wait at once", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      new ApiRequestError({
        status: 429,
        code: "rate_limited",
        message: "Too many requests.",
        details: { retryAfterSeconds: 60 },
      }),
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    let outcome: unknown = null;

    const pending = transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        signal: controller.signal,
        retry: DEFAULT_RETRY_POLICY,
      }),
    ).then((ended) => {
      outcome = ended;
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
    await pending;
  });
});

describe("transferUploadFile cancelled during a backoff", () => {
  // A retry policy whose `abortOnSleep`th sleep cancels the transfer.
  const _abortingRetry = (options: {
    controller: AbortController;
    abortOnSleep: number;
    maxAttempts?: number;
  }): RetryPolicy => {
    let sleepCount = 0;
    return {
      ...makeInstantRetryPolicyFromAttempts(options.maxAttempts),
      sleep: async () => {
        sleepCount += 1;
        if (sleepCount === options.abortOnSleep) {
          options.controller.abort();
        }
      },
    };
  };

  it("sends no second presign", async () => {
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      new ApiRequestError({
        status: 503,
        code: "upload_storage_unavailable",
        message: "Backblaze is down.",
      }),
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        signal: controller.signal,
        retry: _abortingRetry({ controller, abortOnSleep: 1 }),
      }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.presignUploadFile).toHaveBeenCalledTimes(1);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("sends no second PUT", async () => {
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    const transport = makeUploadTransportFromAnswers([
      { status: 503, etag: undefined },
    ]);

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport,
        signal: controller.signal,
        retry: _abortingRetry({ controller, abortOnSleep: 1 }),
      }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(transport.calls).toHaveLength(1);
    expect(api.completeUploadFile).not.toHaveBeenCalled();
  });

  it("sends no second complete", async () => {
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValue(
      new ApiRequestError({
        status: 503,
        code: "upload_storage_unavailable",
        message: "Backblaze is down.",
      }),
    );

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([]),
        signal: controller.signal,
        retry: _abortingRetry({ controller, abortOnSleep: 1 }),
      }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
  });

  it("sends no second try of the failed complete either", async () => {
    const controller = new AbortController();
    const api = makeUploadApiFromAnswers([
      makeSinglePresignFromOverrides("https://b2/original"),
    ]);
    api.completeUploadFile.mockRejectedValue(
      new ApiRequestError({
        status: 503,
        code: "upload_storage_unavailable",
        message: "Backblaze is down.",
      }),
    );
    const lost = new UploadNetworkError("The PUT to storage got no answer");

    const outcome = await transferUploadFile(
      makeTransferOptionsFromOverrides({
        api,
        transport: makeUploadTransportFromAnswers([lost, lost]),
        signal: controller.signal,
        retry: _abortingRetry({
          controller,
          abortOnSleep: 2,
          maxAttempts: 2,
        }),
      }),
    );

    expect(outcome).toEqual({ outcome: "aborted" });
    expect(api.completeUploadFile).toHaveBeenCalledTimes(1);
  });
});

describe("failUploadFile", () => {
  it("completes a file that never reached a transfer as failed", async () => {
    const api = makeUploadApiFromAnswers([]);

    const outcome = await failUploadFile({
      sessionId: SESSION_ID,
      fileId: FILE_ID,
      api,
      signal: new AbortController().signal,
      problemCode: "connection_lost",
      detail: "NotReadableError: The file is gone.",
      retry: makeInstantRetryPolicyFromAttempts(),
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
    const api = makeUploadApiFromAnswers([]);

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
