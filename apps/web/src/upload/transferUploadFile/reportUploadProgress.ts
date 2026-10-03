import type { TransferContext } from "./transferUploadFile.types";

/**
 * Reports progress: never less than the highest figure so far, and never more
 * than the total, which shrinks when a derivative is dropped.
 *
 * @param inFlightBytes What the PUT under way has sent, on top of what landed.
 */
export function reportUploadProgress(
  functionOptions: Readonly<{
    context: TransferContext;
    inFlightBytes: number;
  }>,
): void {
  const { context, inFlightBytes } = functionOptions;

  context.reportedBytes = Math.min(
    Math.max(context.reportedBytes, context.landedBytes + inFlightBytes),
    context.totalBytes,
  );
  context.onProgress({
    sentBytes: context.reportedBytes,
    totalBytes: context.totalBytes,
  });
}
