import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import { getDetailFromError } from "@/upload/mediaWorker/answerMediaWorkerRequest/getDetailFromError";

import {
  getBackoffDelayMsFromAttempt,
  getRateLimitWaitMsFromRetryAfter,
  RATE_LIMIT_MAX_WAITS,
} from "@/upload/transferUploadFile/transferPlanningHelpers";

import {
  isBrowserOffline,
  waitForOnline,
} from "@/upload/transferUploadFile/waitForOnlineHelpers";

import type {
  TransferContext,
  RetryState,
  FailedTry,
  RetryPlan,
  WithApiRetryOptions,
} from "./transferUploadFile.types";

import {
  throwIfUploadCancelled,
  isRetryableApiError,
} from "./uploadTransferErrorHelpers";

import { UploadTransferError } from "./UploadTransferError";

/** Waits out one backoff, then stops if the transfer was cancelled. */
export async function waitBeforeNextUploadTry(
  functionOptions: Readonly<{
    context: Readonly<Pick<TransferContext, "retry" | "signal">>;
    attempt: number;
  }>,
): Promise<void> {
  const { context, attempt } = functionOptions;

  await context.retry.sleep({
    delayMs: getBackoffDelayMsFromAttempt({ attempt, ...context.retry }),
    signal: context.signal,
  });
  throwIfUploadCancelled(context.signal);
}

/**
 * How a failed try is followed.
 *
 * A `429` is waited out for the pause the server asked for and spends no try,
 * up to `RATE_LIMIT_MAX_WAITS` of them: the server is answering, and a batch
 * that met the limit is not a batch that failed. No answer while the browser
 * says it is offline is waited out until it is back, and spends no try either,
 * until the file has waited `OFFLINE_WAIT_CEILING_MS` in all. Anything else
 * `isRetryable` accepts takes the policy's backoff and spends a try.
 */
function getUploadRetryPlanFromFailure(
  functionOptions: Readonly<{
    state: Readonly<RetryState>;
    failure: Readonly<FailedTry>;
  }>,
): RetryPlan {
  const { state, failure } = functionOptions;

  if (state.signal.aborted) {
    return { kind: "give-up" };
  }
  const waitMs = ((error: unknown): number | undefined => {
    if (!(error instanceof ApiRequestError) || error.status !== 429) {
      return undefined;
    }
    return getRateLimitWaitMsFromRetryAfter(error.details?.retryAfterSeconds);
  })(failure.error);
  if (waitMs !== undefined && state.rateLimitWaitCount < RATE_LIMIT_MAX_WAITS) {
    return { kind: "rate-limited", waitMs };
  }
  const canWaitOffline = failure.isUnanswered && state.offlineBudgetMs > 0;
  if (canWaitOffline && isBrowserOffline()) {
    return { kind: "offline" };
  }
  return failure.isRetryable && failure.attempt < state.retry.maxAttempts
    ? { kind: "backoff" }
    : { kind: "give-up" };
}

/**
 * Waits for the browser to come back, out of what is left of the file's
 * offline budget. A wait that ran out leaves none, so the next failure takes
 * the ordinary backoff and the file is reported rather than held.
 */
async function _waitOutOffline(state: RetryState): Promise<void> {
  const startedAtMs = state.now();
  const isOnline = await waitForOnline({
    signal: state.signal,
    timeoutMs: state.offlineBudgetMs,
  });
  const waitedMs = Math.max(0, state.now() - startedAtMs);
  state.offlineBudgetMs = isOnline
    ? Math.max(0, state.offlineBudgetMs - waitedMs)
    : 0;
  throwIfUploadCancelled(state.signal);
}

/** Waits as the plan says, then answers the next try's number. */
async function waitForNextUploadTry(
  functionOptions: Readonly<{
    state: RetryState;
    plan: Exclude<RetryPlan, { kind: "give-up" }>;
    attempt: number;
  }>,
): Promise<number> {
  const { state, plan, attempt } = functionOptions;

  if (plan.kind === "rate-limited") {
    state.rateLimitWaitCount += 1;
    await state.retry.sleep({ delayMs: plan.waitMs, signal: state.signal });
    throwIfUploadCancelled(state.signal);
    return attempt;
  }
  if (plan.kind === "offline") {
    await _waitOutOffline(state);
    return attempt;
  }
  await waitBeforeNextUploadTry({ context: state, attempt: attempt });
  return attempt + 1;
}

/**
 * Calls the API, waiting out a `429` or an offline browser, and trying again
 * with backoff on what `isRetryable` accepts: by default a 502, 503 or 504,
 * or a network error.
 */
export async function callUploadApiWithRetry<T>(
  functionOptions: Readonly<WithApiRetryOptions<T>>,
): Promise<T> {
  const {
    state,
    call,
    isRetryable = isRetryableApiError,
    attempt = 1,
  } = functionOptions;

  try {
    return await call();
  } catch (error: unknown) {
    const plan = getUploadRetryPlanFromFailure({
      state: state,
      failure: {
        error,
        attempt,
        isRetryable: isRetryable(error),
        // `fetch` rejects with a `TypeError` when no answer came at all.
        isUnanswered: error instanceof TypeError,
      },
    });
    if (plan.kind === "give-up") {
      throw error;
    }
    const nextAttempt = await waitForNextUploadTry({
      state: state,
      plan: plan,
      attempt: attempt,
    });
    return callUploadApiWithRetry({
      state: state,
      call: call,
      isRetryable: isRetryable,
      attempt: nextAttempt,
    });
  }
}

/**
 * The next try's number after a PUT that got no answer, once the wait before
 * it is over: until the browser is back if it is offline, or the backoff.
 * Gives up with `connection_lost` once the tries are spent.
 */
export async function waitAfterUnansweredUploadPut(
  functionOptions: Readonly<{
    context: TransferContext;
    failure: Readonly<{ error: unknown; attempt: number }>;
  }>,
): Promise<number> {
  const { context, failure } = functionOptions;

  if (context.signal.aborted) {
    throw failure.error;
  }
  const plan = getUploadRetryPlanFromFailure({
    state: context,
    failure: {
      ...failure,
      isRetryable: true,
      isUnanswered: true,
    },
  });
  if (plan.kind === "give-up") {
    throw new UploadTransferError({
      problemCode: "connection_lost",
      message: getDetailFromError(failure.error),
    });
  }
  return waitForNextUploadTry({
    state: context,
    plan: plan,
    attempt: failure.attempt,
  });
}
