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
  getRequiredLifetimeMsFromRate,
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
  totalBytes: number;
};

/** One part that landed, with the ETag `complete` hands to Backblaze. */
type SentPart = { partNumber: number; etag: string };

/** A presigned URL and when it stops working. */
type UrlLease = { url: string; expiresAt: string };

/** A single-PUT presign: its URL, and the headers to send with it. */
type SingleLease = UrlLease & { headers: Record<string, string> };

/** Whether an API failure is worth trying again: a 503, or no answer. */
function _isRetryableApiError(error: unknown): boolean {
  return error instanceof ApiRequestError
    ? error.status === 503
    : error instanceof TypeError;
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

/**
 * Calls the API, trying again with backoff on what `isRetryable` accepts: by
 * default a 503 or a network error.
 */
async function _withApiRetry<T>(
  context: Readonly<Pick<TransferContext, "retry" | "signal">>,
  call: () => Promise<T>,
  isRetryable: (error: unknown) => boolean = _isRetryableApiError,
  attempt = 1,
): Promise<T> {
  try {
    return await call();
  } catch (error: unknown) {
    const canRetry =
      isRetryable(error) &&
      attempt < context.retry.maxAttempts &&
      !context.signal.aborted;
    if (!canRetry) {
      throw error;
    }
    await context.retry.sleep(
      getBackoffDelayMsFromAttempt({ attempt, ...context.retry }),
    );
    return _withApiRetry(context, call, isRetryable, attempt + 1);
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
        context.onProgress({
          sentBytes: context.landedBytes + sentBytes,
          totalBytes: context.totalBytes,
        });
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
  await context.retry.sleep(
    getBackoffDelayMsFromAttempt({ attempt, ...context.retry }),
  );
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
  leases: Map<number, UrlLease>;
  /** Bytes and milliseconds of the parts sent so far: the measured rate. */
  sentBytes: number;
  sentMs: number;
};

/** Fresh URLs for these parts, keeping the upload id (`upload.md`). */
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
  if (presigned.mode !== "multipart") {
    throw new UploadTransferError({
      problemCode: "storage_rejected",
      message: "A part re-presign came back as a single PUT",
    });
  }
  presigned.parts.forEach((part) => {
    state.leases.set(part.partNumber, part);
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
): Promise<UrlLease> {
  const { context, state, range } = request;
  const requiredMs = getRequiredLifetimeMsFromRate({
    partBytes: range.end - range.start,
    measuredBytesPerSecond:
      state.sentMs > 0 ? (state.sentBytes / state.sentMs) * 1000 : null,
  });
  const lease = state.leases.get(range.partNumber);
  const remainingMs =
    lease === undefined ? 0 : Date.parse(lease.expiresAt) - context.now();
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
  const state: MultipartState = {
    presigned,
    leases: new Map(
      presigned.parts.map((part) => {
        return [part.partNumber, part];
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
    // cancellation stops the file.
    if (context.signal.aborted) {
      throw error;
    }
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

/** `complete` with `outcome: "done"`. A 409 means the server failed the row. */
async function _completeDone(
  context: TransferContext,
  sent: Readonly<{
    parts: SentPart[] | undefined;
    renditions: UploadedRendition[];
  }>,
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
    if (error instanceof ApiRequestError && error.status === 409) {
      throw new UploadTransferError({
        problemCode: "checksum_mismatch",
        message: error.message,
        isRowTerminal: true,
      });
    }
    throw error;
  }
}

/** `complete` with `outcome: "failed"`, so the latch runs. Never throws. */
async function _completeFailed(
  context: Readonly<
    Pick<TransferContext, "api" | "sessionId" | "fileId" | "retry" | "signal">
  >,
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
  if (
    error.code === "upload_file_conflict" &&
    error.details?.state === "cancelled"
  ) {
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
 * on `503` and on no answer; Backblaze on a 5xx, a 408, a 429 or no answer,
 * with a fresh URL on a 403 for the one PUT that met it; a part is
 * re-presigned before its URL can expire under it. Giving up ends the file
 * with `complete` `outcome: "failed"` and `connection_lost` or
 * `storage_rejected`, so the batch still settles. A cancellation reports
 * nothing and leaves the row for "send what did arrive" or a resume. A file
 * presign cancelled as a duplicate is skipped: nothing else is sent for it.
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
    const isRowTerminal =
      error instanceof UploadTransferError && error.isRowTerminal;
    return {
      outcome: "failed",
      ...failure,
      response: isRowTerminal ? null : await _completeFailed(context, failure),
    };
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
    { ...options, retry: options.retry ?? DEFAULT_RETRY_POLICY },
    options,
  );
  return {
    outcome: "failed",
    problemCode: options.problemCode,
    detail: options.detail,
    response,
  };
}
