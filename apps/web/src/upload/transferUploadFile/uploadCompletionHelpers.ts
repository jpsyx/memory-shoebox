import type {
  CompleteUploadFileResponse,
  UploadProblemCode,
  UploadedRendition,
} from "@memory-shoebox/shared";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import { getDetailFromError } from "@/upload/mediaWorker/answerMediaWorkerRequest/getDetailFromError";

import { OFFLINE_WAIT_CEILING_MS } from "@/upload/transferUploadFile/transferPlanningHelpers";

import { UploadTransferError } from "./UploadTransferError";

import type {
  TransferContext,
  SentPart,
  RetryState,
  TransferOutcome,
} from "./transferUploadFile.types";

import {
  callUploadApiWithRetry,
  waitBeforeNextUploadTry,
} from "./uploadRetryHelpers";

import {
  isBatchClosed,
  getDuplicateHolderFromError,
  getUploadFailureFromError,
} from "./uploadTransferErrorHelpers";

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
 * names: the batch gone (`upload_session_conflict`, or `cancelled`) stops the
 * transfer; `sending` is the row moving under the verification, tried once
 * more and then given up on as `connection_lost`; anything else is the
 * server having ended the row, which no second `complete` can change.
 */
export async function completeDoneUploadFile(
  functionOptions: Readonly<{
    context: TransferContext;
    sent: Readonly<{
      parts: SentPart[] | undefined;
      renditions: UploadedRendition[];
    }>;
    isRetry?: boolean;
  }>,
): Promise<CompleteUploadFileResponse> {
  const { context, sent, isRetry = false } = functionOptions;

  try {
    return await _callDoneUploadCompletion(functionOptions);
  } catch (error: unknown) {
    if (!(error instanceof ApiRequestError) || error.status !== 409) {
      throw error;
    }
    if (isBatchClosed(error)) {
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
    await waitBeforeNextUploadTry({ context: context, attempt: 1 });
    return completeDoneUploadFile({
      context: context,
      sent: sent,
      isRetry: true,
    });
  }
}

/**
 * `complete` with `outcome: "failed"`, so the latch runs. Never throws.
 *
 * **With a retry budget of its own**, fresh `429` waits and a fresh offline
 * ceiling, not what is left of the file's: a file that gave up after a long
 * outage has spent its budget, and its report going out without one would
 * fail at once and leave the row `sending` until the sweep. Bounded the same
 * way, so a report that cannot land still ends.
 */
export async function completeFailedUploadFile(
  functionOptions: Readonly<{
    context: Readonly<
      Pick<
        TransferContext,
        "api" | "sessionId" | "fileId" | "retry" | "signal" | "now"
      >
    >;
    failure: Readonly<{ problemCode: UploadProblemCode; detail: string }>;
  }>,
): Promise<CompleteUploadFileResponse | undefined> {
  const { context, failure } = functionOptions;

  const reportState: RetryState = {
    retry: context.retry,
    signal: context.signal,
    now: context.now,
    rateLimitWaitCount: 0,
    offlineBudgetMs: OFFLINE_WAIT_CEILING_MS,
  };
  return callUploadApiWithRetry({
    state: reportState,
    call: () => {
      return context.api.completeUploadFile({
        sessionId: context.sessionId,
        fileId: context.fileId,
        body: {
          outcome: "failed",
          problemCode: failure.problemCode,
          problemDetail: failure.detail,
        },
      });
    },
  }).catch(() => {
    return undefined;
  });
}

/**
 * Another tab, or an answer lost on the way back, already finished this file:
 * `complete` with the same hash is idempotent and answers the row as it is.
 */
async function _completeAlreadyDone(
  context: TransferContext,
): Promise<TransferOutcome> {
  try {
    const response = await completeDoneUploadFile({
      context: context,
      sent: {
        parts: undefined,
        renditions: [],
      },
    });
    return { outcome: "done", response };
  } catch (error: unknown) {
    return {
      outcome: "failed",
      problemCode: "storage_rejected",
      detail: getDetailFromError(error),
      response: undefined,
    };
  }
}

/**
 * How a transfer that threw ended, and what, if anything, it still tells the
 * server: a repeat of a finished file, a skipped duplicate, a batch gone
 * from under it, a cancellation, or a failure ended with `complete` so the
 * batch still settles.
 */
export async function getTransferOutcomeFromError(
  functionOptions: Readonly<{ context: TransferContext; error: unknown }>,
): Promise<TransferOutcome> {
  const { context, error } = functionOptions;

  if (
    ((sourceError: unknown): boolean => {
      return (
        sourceError instanceof ApiRequestError &&
        sourceError.code === "upload_file_conflict" &&
        sourceError.details?.state === "done"
      );
    })(error)
  ) {
    return _completeAlreadyDone(context);
  }
  const holderFileId = getDuplicateHolderFromError(error);
  if (holderFileId !== undefined) {
    return { outcome: "skipped", reason: "duplicate", holderFileId };
  }
  if (!context.signal.aborted && isBatchClosed(error)) {
    return { outcome: "batch-closed" };
  }
  const failure = context.signal.aborted
    ? "aborted"
    : getUploadFailureFromError(error);
  if (failure === "aborted") {
    return { outcome: "aborted" };
  }
  if (error instanceof UploadTransferError && error.isRowTerminal) {
    return { outcome: "failed", ...failure, response: undefined };
  }
  const response = await completeFailedUploadFile({
    context: context,
    failure: failure,
  });
  // A cancel during the failed `complete`'s own backoff leaves the row for
  // "send what did arrive" or a resume, as any other cancellation does.
  if (response === undefined && context.signal.aborted) {
    return { outcome: "aborted" };
  }
  return { outcome: "failed", ...failure, response };
}

// Send the done payload through the API retry policy.
async function _callDoneUploadCompletion(
  options: Parameters<typeof completeDoneUploadFile>[0],
): Promise<CompleteUploadFileResponse> {
  const { context, sent } = options;
  return callUploadApiWithRetry({
    state: context,
    call: () => {
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
    },
  });
}
