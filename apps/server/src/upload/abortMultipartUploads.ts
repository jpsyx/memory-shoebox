import type { FastifyBaseLogger } from "fastify";
import type { B2Client } from "../b2/client/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { UploadFileRow } from "./uploadSessionAccess.ts";

/** One open multipart upload, and the row that holds its id. */
export type MultipartUploadRef = {
  fileId: string;
  storageKey: string;
  multipartUploadId: string;
};

/**
 * The open multipart upload a row holds, or null when it holds none.
 *
 * @param file The row, or the columns of it a `RETURNING` gave back.
 */
export function getMultipartUploadRefFromFile(
  file: Readonly<
    Pick<UploadFileRow, "id" | "storage_key" | "multipart_upload_id">
  >,
): MultipartUploadRef | null {
  if (file.storage_key === null || file.multipart_upload_id === null) {
    return null;
  }
  return {
    fileId: file.id,
    storageKey: file.storage_key,
    multipartUploadId: file.multipart_upload_id,
  };
}

/**
 * Whether Backblaze says the upload is already gone, which is the goal: an
 * earlier abort that landed and whose answer was lost, for one.
 */
function _isNoSuchUpload(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "NoSuchUpload";
}

/** Whether one abort left the upload gone, either way. */
function _isGone(result: PromiseSettledResult<void>): boolean {
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
 * Aborts multipart uploads, so Backblaze stops billing their parts.
 *
 * **Never inside a transaction** (design decision 2): every caller has
 * already committed the row changes this follows, and calls this afterwards.
 *
 * Best effort, by design. Every abort is attempted; the ones Backblaze
 * accepted, and the ones it answered `NoSuchUpload` because the upload is
 * already gone, have `multipart_upload_id` cleared in one statement, and only
 * where the row still holds the id that was aborted, so a retry that opened
 * a new upload in between keeps it. One that failed is logged and keeps its
 * id, which is how the next caller (a retry, or the abandon sweep) still
 * knows there is something to abort. A failure here never fails the request
 * that called it: the rows are already right.
 *
 * @param options.database The outer handle, not a transaction.
 * @param options.b2 The Backblaze client.
 * @param options.uploads The uploads to abort.
 * @param options.logger Where a failed abort is reported. The abandon sweep
 *   passes none: a job takes no logger, and the id the row keeps is its record.
 */
export async function abortMultipartUploads(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  uploads: readonly MultipartUploadRef[];
  logger?: Pick<FastifyBaseLogger, "warn">;
}): Promise<{ abortedCount: number }> {
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
    if (!_isGone(result) && result.status === "rejected") {
      options.logger?.warn(
        { err: result.reason, fileId: uploads[index]?.fileId },
        "multipart abort failed; the row keeps its upload id for the next try",
      );
    }
  });
  const aborted = uploads.filter((_upload, index) => {
    const result = results[index];
    return result !== undefined && _isGone(result);
  });
  await _forgetAbortedUploads({ database: options.database, aborted });
  return { abortedCount: aborted.length };
}
