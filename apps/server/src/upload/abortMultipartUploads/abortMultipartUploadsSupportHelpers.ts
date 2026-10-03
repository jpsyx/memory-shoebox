import type { FastifyBaseLogger } from "fastify";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import type { MultipartUploadRef } from "./abortMultipartUploads.types.ts";

/** The HTTP status the AWS SDK attached to a failure, if it attached one. */
function _getHttpStatusFromError(reason: Error): number | undefined {
  const metadata: unknown = (reason as { $metadata?: unknown }).$metadata;
  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }
  const status: unknown = (metadata as { httpStatusCode?: unknown })
    .httpStatusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * Whether Backblaze says the upload is already gone, which is the goal: an
 * earlier abort that landed and whose answer was lost, for one.
 *
 * By the S3 error code `NoSuchUpload`, or by a 404 that carries no S3 code
 * at all, which the SDK names `NotFound` after the status. A 404 naming any
 * other code is not this: `NoSuchBucket` says the bucket is missing or
 * misnamed, and the upload may well still be open and billed.
 */
function _isNoSuchUpload(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false;
  }
  return reason.name === "NoSuchUpload"
    ? true
    : reason.name === "NotFound" && _getHttpStatusFromError(reason) === 404;
}

/** Whether one abort left the upload gone, either way. */
export function isGone(result: PromiseSettledResult<void>): boolean {
  return result.status === "fulfilled" || _isNoSuchUpload(result.reason);
}

/**
 * Clears `multipart_upload_id` on the rows whose upload Backblaze aborted, in
 * one statement, and only where the row still holds the id that was aborted:
 * a retry that opened a new upload in between keeps it.
 */
async function _forgetAbortedUploads(options: {
  database: DatabaseExecutor;
  aborted: readonly MultipartUploadRef[];
}): Promise<void> {
  if (options.aborted.length === 0) {
    return;
  }
  await options.database
    .updateTable("upload_files")
    .set({ multipart_upload_id: null })
    .where((expressionBuilder) => {
      return expressionBuilder.or(
        options.aborted.map((upload) => {
          return expressionBuilder.and([
            expressionBuilder("id", "=", upload.fileId),
            expressionBuilder(
              "multipart_upload_id",
              "=",
              upload.multipartUploadId,
            ),
          ]);
        }),
      );
    })
    .execute();
}

/**
 * `_forgetAbortedUploads`, with a failure reported rather than thrown.
 *
 * The uploads are already aborted by now, so a write that fails here costs
 * only a stale id on the row. The next caller (a retry, or the abandon sweep)
 * aborts it again and Backblaze answers `NoSuchUpload`, which counts as
 * aborted. Throwing would fail a request whose rows are already right.
 */
export async function forgetAbortedUploadsOrWarn(
  options: Readonly<{
    database: DatabaseExecutor;
    aborted: readonly MultipartUploadRef[];
    logger?: Pick<FastifyBaseLogger, "warn">;
  }>,
): Promise<void> {
  try {
    await _forgetAbortedUploads(options);
  } catch (error) {
    options.logger?.warn(
      {
        err: error,
        fileIds: options.aborted.map((upload) => {
          return upload.fileId;
        }),
      },
      "multipart uploads were aborted but their ids were not cleared; the next abort answers NoSuchUpload, which counts",
    );
  }
}
