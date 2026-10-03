import type {
  CompleteUploadFileResponse,
  PresignMultipart,
  PresignUploadFileResponse,
  RenditionPurpose,
  UploadProblemCode,
  UploadedRendition,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/client/client";
import type {
  MadeDerivative,
  PixelSize,
} from "@/upload/jpegDerivatives/jpegDerivatives";
import { getDetailFromError } from "@/upload/mediaWorker/answerMediaWorkerRequest";
import {
  DEFAULT_RETRY_POLICY,
  getBackoffDelayMsFromAttempt,
  getPartRangesFromSize,
  getRateLimitWaitMsFromRetryAfter,
  getRemainingLifetimeMsFromReceipt,
  getRequiredLifetimeMsFromRate,
  RATE_LIMIT_MAX_WAITS,
  type PartRange,
  type RetryPolicy,
} from "@/upload/transferUploadFile/transferPlanning";
import type {
  PutBytesResult,
  UploadTransport,
} from "@/upload/transferUploadFile/uploadTransport";

/** The two routes a transfer calls. Injectable, so tests need no server. */
export type TransferApi = Pick<
  typeof import("@/api/uploads/uploads"),
  "presignUploadFile" | "completeUploadFile"
>;

/** Bytes sent so far for one file, of all it will send. */
export type TransferProgress = { sentBytes: number; totalBytes: number };

/** Everything one file's transfer needs. */
export type TransferUploadFileOptions = {
  sessionId: string;
  fileId: string;
  file: Blob;
  contentHash: string;
  derivatives: readonly MadeDerivative[];
  /** Post-orientation, as `complete` wants it. Null when nothing could say. */
  size: PixelSize | null;
  durationMs: number | null;
  api: TransferApi;
  transport: UploadTransport;
  signal: AbortSignal;
  onProgress: (progress: TransferProgress) => void;
  retry?: RetryPolicy;
  /** Milliseconds since the epoch. Injectable so expiry is testable. */
  now?: () => number;
};

/** How one file's transfer ended. */
export type TransferOutcome =
  | { outcome: "done"; response: CompleteUploadFileResponse }
  | {
      outcome: "failed";
      problemCode: UploadProblemCode;
      detail: string;
      /** The failed `complete`'s answer, or null if even that did not land. */
      response: CompleteUploadFileResponse | null;
    }
  /**
   * Presign found these bytes in another row of the batch and cancelled this
   * one itself (design decision 15). Nothing else is sent for it.
   */
  | { outcome: "skipped"; reason: "duplicate"; holderFileId: string }
  /** Cancelled here, or the batch was closed under it. Nothing to report. */
  | { outcome: "aborted" };

/**
 * A transfer step that gave up, with the problem code it gave up with.
 *
 * A class for the reason `ApiRequestError` is one: it is thrown, and a
 * thrown thing should be an `Error`.
 */
class UploadTransferError extends Error {
  readonly problemCode: UploadProblemCode;
  /** True when the server has already failed the row itself. */
  readonly isRowTerminal: boolean;

  constructor(
    options: Readonly<{
      problemCode: UploadProblemCode;
      message: string;
      isRowTerminal?: boolean;
    }>,
  ) {
    super(options.message);
    this.name = "UploadTransferError";
    this.problemCode = options.problemCode;
    this.isRowTerminal = options.isRowTerminal ?? false;
  }
}

/** One file's transfer state, threaded through every step. */
type TransferContext = Omit<TransferUploadFileOptions, "retry" | "now"> & {
  retry: RetryPolicy;
  now: () => number;
  /** Bytes of earlier PUTs that landed, for the progress figure. */
  landedBytes: number;
  /** All the file will send. Shrinks when a derivative is dropped. */
  totalBytes: number;
  /** The highest figure reported so far: progress never steps back. */
  reportedBytes: number;
  /** The `429`s waited out so far, against `RATE_LIMIT_MAX_WAITS`. */
  rateLimitWaitCount: number;
};

/** What the retries of one file share: the policy, and what it has spent. */
type RetryState = Pick<
  TransferContext,
  "retry" | "signal" | "rateLimitWaitCount"
>;

/** One part that landed, with the ETag `complete` hands to Backblaze. */
type SentPart = { partNumber: number; etag: string };

/**
 * A presigned URL. The server's `expiresAt` is deliberately not kept: it is
 * on the server's clock, and a lease's life is judged on this one (see
 * `getRemainingLifetimeMsFromReceipt`).
 */
type UrlLease = { url: string };

/** One part's URL, and when this browser received it. */
type PartLease = UrlLease & { receivedAtMs: number };

/** A single-PUT presign: its URL, and the headers to send with it. */
type SingleLease = UrlLease & { headers: Record<string, string> };

/**
 * Whether an API failure is worth trying again: a 503, or the 502 or 504 the
 * proxy answers with while a deploy swaps the server (those carry no body, so
 * they arrive as `unknown_error`), or no answer.
 */
function _isRetryableApiError(error: unknown): boolean {
  return error instanceof ApiRequestError
    ? error.status === 502 || error.status === 503 || error.status === 504
    : error instanceof TypeError;
}

/** Whether `error` is the batch having been closed under this file. */
function _isClosedUnderFile(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.code === "upload_file_conflict" &&
    error.details?.state === "cancelled"
  );
}

/**
 * Whether presign lost a race to another presign of the same file.
 *
 * The loser answers `409 upload_file_conflict` with `details.state: "sending"`:
 * the row is already the winner's, which is exactly what a presign needs, so
 * the answer is to presign again, not a skip and not a failure.
 * Only presign takes this reading: on `complete` the same answer means the
 * row moved under the verification.
 */
function _isLostPresignRace(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.code === "upload_file_conflict" &&
    error.details?.state === "sending"
  );
}

/** Whether a presign failure is worth trying again. */
function _isRetryablePresignError(error: unknown): boolean {
  return _isRetryableApiError(error) || _isLostPresignRace(error);
}

/** Stops if the transfer was cancelled, so nothing is sent after it. */
function _throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The upload was cancelled", "AbortError");
  }
}

/** Waits out one backoff, then stops if the transfer was cancelled. */
async function _waitBeforeNextTry(
  context: Readonly<Pick<TransferContext, "retry" | "signal">>,
  attempt: number,
): Promise<void> {
  await context.retry.sleep(
    getBackoffDelayMsFromAttempt({ attempt, ...context.retry }),
  );
  _throwIfCancelled(context.signal);
}

/** The pause a `429` from the server asks for, or null for any other error. */
function _getRateLimitWaitMsFromError(error: unknown): number | null {
  if (!(error instanceof ApiRequestError) || error.status !== 429) {
    return null;
  }
  return getRateLimitWaitMsFromRetryAfter(error.details?.retryAfterSeconds);
}

/** What one failed try is followed by. */
type RetryPlan =
  | { kind: "rate-limited"; waitMs: number }
  | { kind: "backoff" }
  | { kind: "give-up" };

/**
 * How a failed try is followed.
 *
 * A `429` is waited out for the pause the server asked for and spends no try,
 * up to `RATE_LIMIT_MAX_WAITS` of them: the server is answering, and a batch
 * that met the limit is not a batch that failed. Anything else `isRetryable`
 * accepts takes the policy's backoff and spends a try.
 */
function _getRetryPlan(
  state: Readonly<RetryState>,
  failure: Readonly<{ error: unknown; attempt: number; isRetryable: boolean }>,
): RetryPlan {
  if (state.signal.aborted) {
    return { kind: "give-up" };
  }
  const waitMs = _getRateLimitWaitMsFromError(failure.error);
  if (waitMs !== null && state.rateLimitWaitCount < RATE_LIMIT_MAX_WAITS) {
    return { kind: "rate-limited", waitMs };
  }
  if (failure.isRetryable && failure.attempt < state.retry.maxAttempts) {
    return { kind: "backoff" };
  }
  return { kind: "give-up" };
}

/** Waits as the plan says, then answers the next try's number. */
async function _waitForNextTry(
  state: RetryState,
  plan: Exclude<RetryPlan, { kind: "give-up" }>,
  attempt: number,
): Promise<number> {
  if (plan.kind === "rate-limited") {
    state.rateLimitWaitCount += 1;
    await state.retry.sleep(plan.waitMs);
    _throwIfCancelled(state.signal);
    return attempt;
  }
  await _waitBeforeNextTry(state, attempt);
  return attempt + 1;
}

/**
 * Calls the API, waiting out a `429` and trying again with backoff on what
 * `isRetryable` accepts: by default a 502, 503 or 504, or a network error.
 */
async function _withApiRetry<T>(
  state: RetryState,
  call: () => Promise<T>,
  isRetryable: (error: unknown) => boolean = _isRetryableApiError,
  attempt = 1,
): Promise<T> {
  try {
    return await call();
  } catch (error: unknown) {
    const plan = _getRetryPlan(state, {
      error,
      attempt,
      isRetryable: isRetryable(error),
    });
    if (plan.kind === "give-up") {
      throw error;
    }
    const nextAttempt = await _waitForNextTry(state, plan, attempt);
    return _withApiRetry(state, call, isRetryable, nextAttempt);
  }
}

/** Presigns one rendition of this file, with the API's retry. */
function _presign(
  context: TransferContext,
  body: Readonly<{
    purpose: RenditionPurpose;
    byteSize: number;
    partNumbers?: number[];
  }>,
): Promise<PresignUploadFileResponse> {
  return _withApiRetry(
    context,
    () => {
      return context.api.presignUploadFile({
        sessionId: context.sessionId,
        fileId: context.fileId,
        body: { contentHash: context.contentHash, ...body },
      });
    },
    _isRetryablePresignError,
  );
}

/** Whether a Backblaze status is a passing fault worth another try. */
function _isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** What a PUT needs, and how to get a fresh URL for it after a 403. */
type PutRequest = {
  context: TransferContext;
  lease: UrlLease;
  headers: Readonly<Record<string, string>>;
  body: Blob;
  /** A fresh URL for exactly this PUT: the same part, or the same file. */
  represign: () => Promise<UrlLease>;
};

/**
 * Reports progress: never less than the highest figure so far, and never more
 * than the total, which shrinks when a derivative is dropped.
 *
 * @param inFlightBytes What the PUT under way has sent, on top of what landed.
 */
function _reportProgress(
  context: TransferContext,
  inFlightBytes: number,
): void {
  context.reportedBytes = Math.min(
    Math.max(context.reportedBytes, context.landedBytes + inFlightBytes),
    context.totalBytes,
  );
  context.onProgress({
    sentBytes: context.reportedBytes,
    totalBytes: context.totalBytes,
  });
}

/** One PUT, as an answer or as the lack of one. */
async function _putOnce(
  request: Readonly<PutRequest>,
): Promise<PutBytesResult | { status: "unanswered"; error: unknown }> {
  const { context } = request;
  return context.transport
    .putBytes({
      url: request.lease.url,
      headers: request.headers,
      body: request.body,
      signal: context.signal,
      onProgress: (sentBytes) => {
        _reportProgress(context, sentBytes);
      },
    })
    .catch((error: unknown) => {
      return { status: "unanswered" as const, error };
    });
}

/**
 * PUTs until it lands, or gives up with a problem code.
 *
 * A 403 is an expired URL (`upload.md` § When a presigned URL expires): it
 * gets one fresh URL for this PUT alone, and a second 403 on that is a real
 * refusal. A 5xx, a 408, a 429 or no answer at all is tried again with
 * backoff. Anything else is the bucket refusing, as `storage_rejected`.
 */
async function _putUntilLanded(
  request: Readonly<PutRequest>,
  attempt = 1,
  hasRepresigned = false,
): Promise<PutBytesResult> {
  const { context } = request;
  const answer = await _putOnce(request);
  if (answer.status === "unanswered") {
    if (context.signal.aborted) {
      throw answer.error;
    }
    if (attempt >= context.retry.maxAttempts) {
      throw new UploadTransferError({
        problemCode: "connection_lost",
        message: getDetailFromError(answer.error),
      });
    }
  } else if (answer.status >= 200 && answer.status < 300) {
    context.landedBytes += request.body.size;
    return answer;
  } else if (answer.status === 403 && !hasRepresigned) {
    const lease = await request.represign();
    return _putUntilLanded({ ...request, lease }, attempt, true);
  } else if (
    !_isRetryableStatus(answer.status) ||
    attempt >= context.retry.maxAttempts
  ) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `Storage answered ${answer.status}`,
    });
  }
  await _waitBeforeNextTry(context, attempt);
  return _putUntilLanded(request, attempt + 1, hasRepresigned);
}

/** The single-PUT presign, or an error if the server chose multipart. */
function _requireSingle(presigned: PresignUploadFileResponse): SingleLease {
  if (presigned.mode !== "single") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: "Expected a single PUT and was given a multipart upload",
    });
  }
  return presigned;
}

/** The multipart state one file carries from part to part. */
type MultipartState = {
  presigned: PresignMultipart;
  leases: Map<number, PartLease>;
  /** Bytes and milliseconds of the parts sent so far: the measured rate. */
  sentBytes: number;
  sentMs: number;
};

/**
 * Fresh URLs for these parts, keeping the upload id (`upload.md`).
 *
 * A re-presign that names a different upload would orphan every part already
 * sent, and `complete` would then assemble nothing from them, so it fails the
 * file here rather than at the end of the transfer.
 */
async function _refreshPartLeases(
  context: TransferContext,
  state: MultipartState,
  partNumbers: number[],
): Promise<void> {
  const presigned = await _presign(context, {
    purpose: "original",
    byteSize: context.file.size,
    partNumbers,
  });
  const receivedAtMs = context.now();
  if (presigned.mode !== "multipart") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: "A part re-presign came back as a single PUT",
    });
  }
  if (presigned.multipartUploadId !== state.presigned.multipartUploadId) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message:
        "A part re-presign named a different multipart upload, so the parts already sent would be lost",
    });
  }
  presigned.parts.forEach((part) => {
    state.leases.set(part.partNumber, { url: part.url, receivedAtMs });
  });
}

/** What sending one part needs to know about the parts around it. */
type PartRequest = {
  context: TransferContext;
  state: MultipartState;
  range: PartRange;
  laterPartNumbers: number[];
};

/** The lease for a part, refreshed first if it will not outlive the part. */
async function _getLiveLease(
  request: Readonly<PartRequest>,
): Promise<PartLease> {
  const { context, state, range } = request;
  const requiredMs = getRequiredLifetimeMsFromRate({
    partBytes: range.end - range.start,
    measuredBytesPerSecond:
      state.sentMs > 0 ? (state.sentBytes / state.sentMs) * 1000 : null,
  });
  const lease = state.leases.get(range.partNumber);
  const remainingMs =
    lease === undefined
      ? 0
      : getRemainingLifetimeMsFromReceipt({
          receivedAtMs: lease.receivedAtMs,
          nowMs: context.now(),
        });
  if (remainingMs < requiredMs) {
    // Ahead of the 403 rather than after it, and for every part still to
    // go, so a slow link re-presigns once rather than once a part.
    await _refreshPartLeases(context, state, [
      range.partNumber,
      ...request.laterPartNumbers,
    ]);
  }
  const fresh = state.leases.get(range.partNumber);
  if (fresh === undefined) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `No URL was presigned for part ${range.partNumber}`,
    });
  }
  return fresh;
}

/** Sends one part and answers its ETag. */
async function _sendPart(request: Readonly<PartRequest>): Promise<string> {
  const { context, state, range } = request;
  const lease = await _getLiveLease(request);
  const startedAt = context.now();
  const answer = await _putUntilLanded({
    context,
    lease,
    headers: state.presigned.headers,
    body: context.file.slice(range.start, range.end),
    represign: async () => {
      await _refreshPartLeases(context, state, [range.partNumber]);
      return state.leases.get(range.partNumber) ?? lease;
    },
  });
  state.sentBytes += range.end - range.start;
  state.sentMs += Math.max(1, context.now() - startedAt);
  // `complete` refuses a blank ETag as it refuses a missing one.
  if (answer.etag === null || answer.etag.trim() === "") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `Part ${range.partNumber} landed but its ETag is unreadable: the bucket's CORS rule must expose ETag (pnpm b2:cors)`,
    });
  }
  return answer.etag;
}

/** Every part, in order, each with the ETag `complete` needs. */
async function _sendParts(
  context: TransferContext,
  presigned: PresignMultipart,
): Promise<SentPart[]> {
  const ranges = getPartRangesFromSize({
    byteSize: context.file.size,
    partSizeBytes: presigned.partSizeBytes,
  });
  if (ranges.length !== presigned.partCount) {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: `The server planned ${presigned.partCount} parts and the file makes ${ranges.length}`,
    });
  }
  const receivedAtMs = context.now();
  const state: MultipartState = {
    presigned,
    leases: new Map(
      presigned.parts.map((part) => {
        return [part.partNumber, { url: part.url, receivedAtMs }];
      }),
    ),
    sentBytes: 0,
    sentMs: 0,
  };
  return ranges.reduce<Promise<SentPart[]>>(async (sentSoFar, range, index) => {
    const sent = await sentSoFar;
    const laterPartNumbers = ranges.slice(index + 1).map((later) => {
      return later.partNumber;
    });
    const etag = await _sendPart({ context, state, range, laterPartNumbers });
    return [...sent, { partNumber: range.partNumber, etag }];
  }, Promise.resolve([]));
}

/** The original, by whichever mode the server chose. Answers the ETags. */
async function _sendOriginal(
  context: TransferContext,
): Promise<SentPart[] | undefined> {
  const presigned = await _presign(context, {
    purpose: "original",
    byteSize: context.file.size,
  });
  if (presigned.mode === "multipart") {
    return _sendParts(context, presigned);
  }
  await _putUntilLanded({
    context,
    lease: presigned,
    headers: presigned.headers,
    body: context.file,
    // A single PUT that expired restarts whole, which is why anything large
    // is multipart (`appConfig.upload.multipartThresholdBytes`).
    represign: async () => {
      return _requireSingle(
        await _presign(context, {
          purpose: "original",
          byteSize: context.file.size,
        }),
      );
    },
  });
  return undefined;
}

/**
 * One derivative: presign, PUT. Answers its rendition, or null to drop it.
 *
 * The presign names the derivative's purpose and the *original's* size: a
 * derivative rides the original's presign (design decision 3), so the hash
 * and the size always describe the original, and the derivative's own size
 * is reported at `complete`, where Backblaze confirms it.
 */
async function _sendDerivative(
  context: TransferContext,
  derivative: MadeDerivative,
): Promise<UploadedRendition | null> {
  const presignDerivative = async (): Promise<SingleLease> => {
    return _requireSingle(
      await _presign(context, {
        purpose: derivative.purpose,
        byteSize: context.file.size,
      }),
    );
  };
  try {
    const lease = await presignDerivative();
    await _putUntilLanded({
      context,
      lease,
      headers: lease.headers,
      body: derivative.blob,
      represign: presignDerivative,
    });
    return {
      purpose: derivative.purpose,
      byteSize: derivative.blob.size,
      width: derivative.width,
      height: derivative.height,
    };
  } catch (error: unknown) {
    // A derivative that will not land is dropped, as one that could not be
    // made is (Ruling 1): the file still completes, on its original. Only a
    // cancellation, or the batch closing under the file, stops it.
    if (context.signal.aborted || _isClosedUnderFile(error)) {
      throw error;
    }
    // It no longer counts toward the total, so the file can reach 100%.
    context.totalBytes -= derivative.blob.size;
    _reportProgress(context, 0);
    return null;
  }
}

/** Every derivative, one at a time, keeping the ones that landed. */
async function _sendDerivatives(
  context: TransferContext,
): Promise<UploadedRendition[]> {
  return context.derivatives.reduce<Promise<UploadedRendition[]>>(
    async (landedSoFar, derivative) => {
      const landed = await landedSoFar;
      const rendition = await _sendDerivative(context, derivative);
      return rendition === null ? landed : [...landed, rendition];
    },
    Promise.resolve([]),
  );
}

/**
 * The error for a `409` that says the server has ended the row itself.
 *
 * `state: "failed"` is the server's verdict on what landed (a hash that
 * disagrees, an object of the wrong size, parts Backblaze would not
 * assemble). The browser cannot tell which, so it reports the verdict as
 * `content_mismatch` and leaves the exact code on the row, where the batch's
 * detail reads it. Any other state is reported as `checksum_mismatch`.
 */
function _makeTerminalErrorFromConflict(
  error: Readonly<ApiRequestError>,
): UploadTransferError {
  const hasServerRefused = error.details?.state === "failed";
  return new UploadTransferError({
    problemCode: hasServerRefused ? "content_mismatch" : "checksum_mismatch",
    message: hasServerRefused
      ? `The server refused what landed: ${error.message}`
      : error.message,
    isRowTerminal: true,
  });
}

/**
 * `complete` with `outcome: "done"`, and what its `409` means by the state it
 * names: `cancelled` is the batch closed under the file, so the transfer
 * stops quietly; `sending` is the row moving under the verification, tried
 * once more and then given up on as `connection_lost`; anything else is the
 * server having ended the row, which no second `complete` can change.
 */
async function _completeDone(
  context: TransferContext,
  sent: Readonly<{
    parts: SentPart[] | undefined;
    renditions: UploadedRendition[];
  }>,
  isRetry = false,
): Promise<CompleteUploadFileResponse> {
  try {
    return await _withApiRetry(context, () => {
      return context.api.completeUploadFile({
        sessionId: context.sessionId,
        fileId: context.fileId,
        body: {
          outcome: "done",
          contentHash: context.contentHash,
          byteSize: context.file.size,
          ...(sent.parts === undefined ? {} : { parts: sent.parts }),
          width: context.size?.width ?? null,
          height: context.size?.height ?? null,
          durationMs: context.durationMs,
          renditions: sent.renditions,
        },
      });
    });
  } catch (error: unknown) {
    if (!(error instanceof ApiRequestError) || error.status !== 409) {
      throw error;
    }
    if (_isClosedUnderFile(error)) {
      throw error;
    }
    if (error.details?.state !== "sending") {
      throw _makeTerminalErrorFromConflict(error);
    }
    if (isRetry) {
      throw new UploadTransferError({
        problemCode: "connection_lost",
        message: `The row kept moving while it was completed: ${error.message}`,
      });
    }
    await _waitBeforeNextTry(context, 1);
    return _completeDone(context, sent, true);
  }
}

/** `complete` with `outcome: "failed"`, so the latch runs. Never throws. */
async function _completeFailed(
  context: RetryState &
    Readonly<Pick<TransferContext, "api" | "sessionId" | "fileId">>,
  failure: Readonly<{ problemCode: UploadProblemCode; detail: string }>,
): Promise<CompleteUploadFileResponse | null> {
  return _withApiRetry(context, () => {
    return context.api.completeUploadFile({
      sessionId: context.sessionId,
      fileId: context.fileId,
      body: {
        outcome: "failed",
        problemCode: failure.problemCode,
        problemDetail: failure.detail,
      },
    });
  }).catch(() => {
    return null;
  });
}

/** Whether presign refused because this file is already up. */
function _isAlreadyDone(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.code === "upload_file_conflict" &&
    error.details?.state === "done"
  );
}

/**
 * The row holding these bytes, when presign cancelled this one as its
 * duplicate (design decision 15), or null for any other error.
 *
 * Only a duplicate's `409` names a `fileId` beside `state: "cancelled"`: a row
 * cancelled by "send what did arrive" answers with its state alone.
 */
function _getDuplicateHolderFromError(error: unknown): string | null {
  const isDuplicate =
    error instanceof ApiRequestError &&
    error.code === "upload_file_conflict" &&
    error.details?.state === "cancelled";
  return isDuplicate ? (error.details?.fileId ?? null) : null;
}

/**
 * Another tab, or an answer lost on the way back, already finished this file:
 * `complete` with the same hash is idempotent and answers the row as it is.
 */
async function _completeAlreadyDone(
  context: TransferContext,
): Promise<TransferOutcome> {
  try {
    const response = await _completeDone(context, {
      parts: undefined,
      renditions: [],
    });
    return { outcome: "done", response };
  } catch (error: unknown) {
    return {
      outcome: "failed",
      problemCode: "storage_rejected",
      detail: getDetailFromError(error),
      response: null,
    };
  }
}

/** What a thrown error means for this file. */
function _getFailureFromError(
  error: unknown,
): { problemCode: UploadProblemCode; detail: string } | "aborted" {
  if (error instanceof UploadTransferError) {
    return { problemCode: error.problemCode, detail: error.message };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "aborted";
  }
  if (!(error instanceof ApiRequestError)) {
    return {
      problemCode: "connection_lost",
      detail: getDetailFromError(error),
    };
  }
  if (_isClosedUnderFile(error)) {
    // "Send what did arrive" closed the batch under this file. A duplicate's
    // cancel never reaches here: `transferUploadFile` skips it first.
    return "aborted";
  }
  return {
    problemCode: "storage_rejected",
    detail: `${error.code}: ${error.message}`,
  };
}

/**
 * How a transfer that threw ended, and what, if anything, it still tells the
 * server: a repeat of a finished file, a skipped duplicate, a cancellation, or
 * a failure ended with `complete` so the batch still settles.
 */
async function _getOutcomeFromError(
  context: TransferContext,
  error: unknown,
): Promise<TransferOutcome> {
  if (_isAlreadyDone(error)) {
    return _completeAlreadyDone(context);
  }
  const holderFileId = _getDuplicateHolderFromError(error);
  if (holderFileId !== null) {
    return { outcome: "skipped", reason: "duplicate", holderFileId };
  }
  const failure = context.signal.aborted
    ? "aborted"
    : _getFailureFromError(error);
  if (failure === "aborted") {
    return { outcome: "aborted" };
  }
  if (error instanceof UploadTransferError && error.isRowTerminal) {
    return { outcome: "failed", ...failure, response: null };
  }
  const response = await _completeFailed(context, failure);
  // A cancel during the failed `complete`'s own backoff leaves the row for
  // "send what did arrive" or a resume, as any other cancellation does.
  if (response === null && context.signal.aborted) {
    return { outcome: "aborted" };
  }
  return { outcome: "failed", ...failure, response };
}

/**
 * Transfers one file whose hash and derivatives are already made, then ends
 * it with `complete` whichever way it went.
 *
 * In the order design decision 8 sets: the original (one PUT, or its parts in
 * order with each part's ETag), then each derivative, then `complete` with
 * the renditions that landed, the post-orientation size and the duration.
 * Bytes go straight to Backblaze; only the two control-plane calls touch the
 * server.
 *
 * **Retries are bounded and each failure has its code.** The API is retried
 * on `502`, `503` and `504` and on no answer, and a `429` from it is waited
 * out for its `retryAfterSeconds` without spending a try; Backblaze on a 5xx,
 * a 408, a 429 or no answer, with a fresh URL on a 403 for the one PUT that
 * met it. A
 * part is re-presigned before its URL can expire under it, judged on this
 * browser's clock from when the URL arrived. Giving up ends the file with
 * `complete` `outcome: "failed"` and `connection_lost` or `storage_rejected`,
 * so the batch still settles; a `complete` the server answers `409 failed` is
 * reported as `content_mismatch` without a second call.
 *
 * **A cancellation reports nothing**, including one that lands during a
 * backoff, and leaves the row for "send what did arrive" or a resume. So does
 * a batch closed under the file (a `409` saying `cancelled`, from presign or
 * from `complete`). A file presign cancelled as a duplicate is skipped:
 * nothing else is sent for it.
 *
 * @returns How it ended, with the server's answer where there is one.
 */
export async function transferUploadFile(
  options: Readonly<TransferUploadFileOptions>,
): Promise<TransferOutcome> {
  const context: TransferContext = {
    ...options,
    retry: options.retry ?? DEFAULT_RETRY_POLICY,
    now: options.now ?? Date.now,
    landedBytes: 0,
    reportedBytes: 0,
    rateLimitWaitCount: 0,
    totalBytes: options.derivatives.reduce((sum, derivative) => {
      return sum + derivative.blob.size;
    }, options.file.size),
  };
  try {
    const parts = await _sendOriginal(context);
    const renditions = await _sendDerivatives(context);
    const response = await _completeDone(context, { parts, renditions });
    return { outcome: "done", response };
  } catch (error: unknown) {
    return _getOutcomeFromError(context, error);
  }
}

/**
 * Ends a file that never reached a transfer: one the browser could not read,
 * or whose worker died under it.
 *
 * The row is still `waiting`, and only a terminal state lets the batch
 * settle, so the file is completed as failed exactly as a transfer that gave
 * up would be. Nothing is sent after a cancellation.
 */
export async function failUploadFile(
  options: Readonly<{
    sessionId: string;
    fileId: string;
    api: TransferApi;
    signal: AbortSignal;
    problemCode: UploadProblemCode;
    detail: string;
    retry?: RetryPolicy;
  }>,
): Promise<TransferOutcome> {
  if (options.signal.aborted) {
    return { outcome: "aborted" };
  }
  const response = await _completeFailed(
    {
      ...options,
      retry: options.retry ?? DEFAULT_RETRY_POLICY,
      rateLimitWaitCount: 0,
    },
    options,
  );
  if (response === null && options.signal.aborted) {
    return { outcome: "aborted" };
  }
  return {
    outcome: "failed",
    problemCode: options.problemCode,
    detail: options.detail,
    response,
  };
}
