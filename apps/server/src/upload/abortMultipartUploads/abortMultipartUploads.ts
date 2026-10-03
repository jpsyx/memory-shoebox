import type {
  MultipartUploadRef,
  AbortMultipartUploadsOptions,
} from "./abortMultipartUploads.types.ts";

import {
  isGone,
  forgetAbortedUploadsOrWarn,
} from "./abortMultipartUploadsSupportHelpers.ts";

/**
 * Aborts multipart uploads, so Backblaze stops billing their parts.
 *
 * **Never inside a transaction** (design decision 2): every caller has already
 * committed the row changes this follows, and calls this afterwards.
 *
 * Best effort, by design. Every abort is attempted; the ones Backblaze
 * accepted, and the ones it answered `NoSuchUpload` or a 404 with no S3 code
 * because the upload is already gone, have `multipart_upload_id` cleared in one
 * statement, and only where the row still holds the id that was aborted, so a
 * retry that opened a new upload in between keeps it. One that failed is logged
 * with its file, key and upload id. A row that still holds the id keeps it,
 * which is how a later caller (the abandon sweep) still knows there is
 * something to abort; a retry has already cleared the column, so for it the log
 * line is the only record. A failure here never fails the request that called
 * it, the write that clears the ids included: the rows are already right.
 *
 * @param options.database The outer handle, not a transaction.
 * @param options.b2 The Backblaze client.
 * @param options.uploads The uploads to abort.
 * @param options.logger Where a failed abort is reported. The abandon sweep
 *   passes none: a job takes no logger, and the id the row keeps is its record.
 */
export async function abortMultipartUploads(
  options: Readonly<Omit<AbortMultipartUploadsOptions, "uploads">> &
    Readonly<{ uploads: readonly MultipartUploadRef[] }>,
): Promise<{ abortedCount: number }> {
  const { uploads } = options;
  if (uploads.length === 0) {
    return { abortedCount: 0 };
  }

  const results = await Promise.allSettled(
    uploads.map(async (upload) => {
      await options.b2.abortMultipart({
        key: upload.storageKey,
        uploadId: upload.multipartUploadId,
      });
    }),
  );
  results.forEach((result, index) => {
    if (!isGone(result) && result.status === "rejected") {
      options.logger?.warn(
        {
          err: result.reason,
          fileId: uploads[index]?.fileId,
          storageKey: uploads[index]?.storageKey,
          uploadId: uploads[index]?.multipartUploadId,
        },
        "multipart abort failed; the upload may still be open at Backblaze, and its parts billed",
      );
    }
  });
  const aborted = uploads.filter((_upload, index) => {
    const result = results[index];
    return result !== undefined && isGone(result);
  });
  await forgetAbortedUploadsOrWarn({ ...options, aborted });
  return { abortedCount: aborted.length };
}
