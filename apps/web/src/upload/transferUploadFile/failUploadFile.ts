import { DEFAULT_RETRY_POLICY } from "@/upload/transferUploadFile/transferPlanningHelpers";

import type {
  TransferOutcome,
  FailUploadFileOptions,
} from "./transferUploadFile.types";

import { completeFailedUploadFile } from "./uploadCompletionHelpers";

/**
 * Ends a file that never reached a transfer: one the browser could not read,
 * or whose worker died under it.
 *
 * The row is still `waiting`, and only a terminal state lets the batch
 * settle, so the file is completed as failed exactly as a transfer that gave
 * up would be. Nothing is sent after a cancellation.
 */
export async function failUploadFile(
  options: Readonly<FailUploadFileOptions>,
): Promise<TransferOutcome> {
  if (options.signal.aborted) {
    return { outcome: "aborted" };
  }
  const { retry = DEFAULT_RETRY_POLICY } = options;
  const response = await completeFailedUploadFile({
    context: {
      ...options,
      retry: retry,
      now: Date.now,
    },
    failure: options,
  });
  if (response === undefined && options.signal.aborted) {
    return { outcome: "aborted" };
  }
  return {
    outcome: "failed",
    problemCode: options.problemCode,
    detail: options.detail,
    response,
  };
}
