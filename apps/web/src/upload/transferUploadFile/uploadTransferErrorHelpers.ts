import type { UploadProblemCode } from "@memory-shoebox/shared";

import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

import { getDetailFromError } from "@/upload/mediaWorker/answerMediaWorkerRequest/getDetailFromError";

import { UploadTransferError } from "./UploadTransferError";

/**
 * Whether an API failure is worth trying again: a 503, or the 502 or 504 the
 * proxy answers with while a deploy swaps the server (those carry no body, so
 * they arrive as `unknown_error`), or no answer.
 */
export function isRetryableApiError(error: unknown): boolean {
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
 * Whether `error` says the batch itself is gone, not just this file.
 *
 * Two answers mean it: `409 upload_session_conflict`, a session cancelled or
 * never committed, and this file's row cancelled under it, which only a
 * close or a cancel of the whole batch does. A duplicate's cancel also names
 * the holder, and is told apart before this is asked.
 */
export function isBatchClosed(error: unknown): boolean {
  const isSessionGone =
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.code === "upload_session_conflict";
  return isSessionGone || _isClosedUnderFile(error);
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
export function isLostPresignRace(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.code === "upload_file_conflict" &&
    error.details?.state === "sending"
  );
}

/** Stops if the transfer was cancelled, so nothing is sent after it. */
export function throwIfUploadCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The upload was cancelled", "AbortError");
  }
}

/**
 * The row holding these bytes, when presign cancelled this one as its duplicate
 * (design decision 15), or undefined for any other error.
 *
 * Only a duplicate's `409` names a `fileId` beside `state: "cancelled"`: a row
 * cancelled by "send what did arrive" answers with its state alone.
 */
export function getDuplicateHolderFromError(
  error: unknown,
): string | undefined {
  const isDuplicate =
    error instanceof ApiRequestError &&
    error.code === "upload_file_conflict" &&
    error.details?.state === "cancelled";
  return isDuplicate ? (error.details?.fileId ?? undefined) : undefined;
}

/** What a thrown error means for this file. */
export function getUploadFailureFromError(
  error: unknown,
): { problemCode: UploadProblemCode; detail: string } | "aborted" {
  if (error instanceof UploadTransferError) {
    return { problemCode: error.problemCode, detail: error.message };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "aborted";
  }
  return !(error instanceof ApiRequestError)
    ? {
        problemCode: "connection_lost",
        detail: getDetailFromError(error),
      }
    : {
        problemCode: "storage_rejected",
        detail: `${error.code}: ${error.message}`,
      };
}
