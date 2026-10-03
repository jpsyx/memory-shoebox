/** State needed to retry a PUT that received no HTTP answer. */
type RetryUnansweredPutOptions = {
  request: PutRequest;
  attempt: number;
  hasRepresigned: boolean;
  error: unknown;
};
import { isLeaseLongEnoughForBytes } from "@/upload/transferUploadFile/transferPlanningHelpers";

import type { PutBytesResult } from "@/upload/transferUploadFile/uploadTransportHelpers/uploadTransportHelpers";

import type { PutRequest } from "./transferUploadFile.types";

import { reportUploadProgress } from "./reportUploadProgress";

import {
  waitAfterUnansweredUploadPut,
  waitBeforeNextUploadTry,
} from "./uploadRetryHelpers";

import { UploadTransferError } from "./UploadTransferError";

/** One PUT, as an answer or as the lack of one. */
async function _putOnce(
  request: Readonly<Omit<PutRequest, "headers">> &
    Readonly<{
      headers: Readonly<Record<string, string>>;
    }>,
): Promise<PutBytesResult | { status: "unanswered"; error: unknown }> {
  const { context } = request;
  return context.transport
    .putBytes({
      url: request.lease.url,
      headers: request.headers,
      body: request.body,
      signal: context.signal,
      onProgress: (sentBytes) => {
        reportUploadProgress({ context: context, inFlightBytes: sentBytes });
      },
    })
    .catch((error: unknown) => {
      return { status: "unanswered" as const, error };
    });
}

/**
 * The request a retry goes out as: the same, or with a fresh URL when the
 * one it has could not carry the PUT to its end at the floor rate. A retry
 * comes after a failure and a wait, so its URL may be most of an hour old,
 * and a PUT started on it could otherwise run on long after it, with the
 * server hearing nothing (`appConfig.upload.abandonGraceMinutes`).
 */
async function _getRequestForRetry(
  request: Readonly<Omit<PutRequest, "headers">> &
    Readonly<{
      headers: Readonly<Record<string, string>>;
    }>,
): Promise<PutRequest> {
  const isLongEnough = isLeaseLongEnoughForBytes({
    receivedAtMs: request.lease.receivedAtMs,
    nowMs: request.context.now(),
    byteCount: request.body.size,
  });
  return isLongEnough
    ? request
    : { ...request, lease: await request.represign() };
}

/**
 * PUTs until it lands, or gives up with a problem code.
 *
 * A 401 (Backblaze's) or 403 (S3's) is an expired URL (`upload.md` § When a
 * presigned URL expires): it gets one fresh URL for this PUT alone, and a
 * second one on that is a real refusal. A 5xx, a 408 or a 429 is tried again
 * with backoff, and so is no answer at all, unless the browser is offline, when
 * it waits for the network instead. Every retry is re-presigned first if its
 * URL would lapse before it could finish. Anything else is the bucket refusing,
 * as `storage_rejected`.
 */
export async function putUploadBytes(
  functionOptions: Readonly<{
    request: Readonly<Omit<PutRequest, "headers">> & {
      headers: Readonly<Record<string, string>>;
    };
    attempt?: number;
    hasRepresigned?: boolean;
  }>,
): Promise<PutBytesResult> {
  const { request, attempt = 1, hasRepresigned = false } = functionOptions;

  const { context } = request;
  const answer = await _putOnce(request);
  if (answer.status === "unanswered") {
    return _retryUnansweredPut({
      request,
      attempt,
      hasRepresigned,
      error: answer.error,
    });
  }
  if (answer.status >= 200 && answer.status < 300) {
    context.landedBytes += request.body.size;
    return answer;
  }
  if ((answer.status === 401 || answer.status === 403) && !hasRepresigned) {
    const lease = await request.represign();
    return putUploadBytes({
      request: { ...request, lease },
      attempt: attempt,
      hasRepresigned: true,
    });
  }
  if (
    !(answer.status === 408 || answer.status === 429 || answer.status >= 500) ||
    attempt >= context.retry.maxAttempts
  ) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `Storage answered ${answer.status}`,
    });
  }
  await waitBeforeNextUploadTry({ context: context, attempt: attempt });
  const retry = await _getRequestForRetry(request);
  return putUploadBytes({
    request: retry,
    attempt: attempt + 1,
    hasRepresigned: hasRepresigned,
  });
}

// Obtain a new lease after an unanswered PUT and retry with the next attempt.
async function _retryUnansweredPut(
  options: Readonly<RetryUnansweredPutOptions>,
): Promise<PutBytesResult> {
  const { request, attempt, hasRepresigned, error } = options;
  const nextAttempt = await waitAfterUnansweredUploadPut({
    context: request.context,
    failure: { error, attempt },
  });
  const retry = await _getRequestForRetry(request);
  return putUploadBytes({
    request: retry,
    attempt: nextAttempt,
    hasRepresigned,
  });
}
