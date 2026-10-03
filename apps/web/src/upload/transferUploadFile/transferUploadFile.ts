import type { MadeDerivative } from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import {
  DEFAULT_RETRY_POLICY,
  OFFLINE_WAIT_CEILING_MS,
} from "@/upload/transferUploadFile/transferPlanningHelpers";

import type {
  TransferUploadFileOptions,
  TransferOutcome,
  TransferContext,
} from "./transferUploadFile.types";

import { sendUploadOriginal } from "./sendUploadOriginal";

import { sendUploadDerivatives } from "./sendUploadDerivatives";

import {
  completeDoneUploadFile,
  getTransferOutcomeFromError,
} from "./uploadCompletionHelpers";

/**
 * Transfers one file whose hash and derivatives are already made, then ends it
 * with `complete` whichever way it went.
 *
 * In the order design decision 8 sets: the original (one PUT, or its parts in
 * order with each part's ETag), then each derivative, then `complete` with the
 * renditions that landed, the post-orientation size and the duration. Bytes go
 * straight to Backblaze; only the two control-plane calls touch the server.
 *
 * **Retries are bounded and each failure has its code.** The API is retried on
 * `502`, `503` and `504` and on no answer, and a `429` from it is waited out
 * for its `retryAfterSeconds` without spending a try; Backblaze on a 5xx, a
 * 408, a 429 or no answer, with a fresh URL on a 401 or 403 (an expired URL)
 * for the one PUT that met it. No answer while the browser is offline is waited
 * out until it is back, spending no try, up to `OFFLINE_WAIT_CEILING_MS` per
 * file. A PUT, a first try or a retry, is re-presigned before it starts if its
 * URL could not carry it to the end at the floor rate, judged on this browser's
 * clock from when the URL arrived. Giving up ends the file with `complete`
 * `outcome: "failed"` and `connection_lost` or `storage_rejected`, so the batch
 * still settles; a `complete` the server answers `409 failed` is reported as
 * `content_mismatch` without a second call.
 *
 * **A cancellation reports nothing**, including one that lands during a
 * backoff, and leaves the row for "send what did arrive" or a resume. **A batch
 * gone from under the file** (`409 upload_session_conflict`, or a `409` saying
 * this file is `cancelled`, from presign or from `complete`) ends it as
 * `batch-closed`, with no failed `complete`, so the caller can stop the rest. A
 * file presign cancelled as a duplicate is skipped: nothing else is sent for
 * it.
 *
 * @returns How it ended, with the server's answer where there is one.
 */
export async function transferUploadFile(
  options: Readonly<Omit<TransferUploadFileOptions, "derivatives">> &
    Readonly<{
      derivatives: readonly MadeDerivative[];
    }>,
): Promise<TransferOutcome> {
  const { retry = DEFAULT_RETRY_POLICY, now = Date.now } = options;
  const context: TransferContext = {
    ...options,
    derivatives: [...options.derivatives],
    retry: retry,
    now: now,
    landedBytes: 0,
    reportedBytes: 0,
    rateLimitWaitCount: 0,
    offlineBudgetMs: OFFLINE_WAIT_CEILING_MS,
    totalBytes: options.derivatives.reduce((sum, derivative) => {
      return sum + derivative.blob.size;
    }, options.file.size),
  };
  try {
    const parts = await sendUploadOriginal(context);
    const renditions = await sendUploadDerivatives(context);
    const response = await completeDoneUploadFile({
      context: context,
      sent: { parts, renditions },
    });
    return { outcome: "done", response };
  } catch (error: unknown) {
    return getTransferOutcomeFromError({ context: context, error: error });
  }
}
