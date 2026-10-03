import { withUploadObjectCleanupLock } from "../../upload/withUploadObjectCleanupLock.ts";
import type { FastifyRequest } from "fastify";
import {
  uploadFileParamsSchema,
  type RetryUploadFileResponse,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import {
  requireViewer,
  type Viewer,
} from "../../http/requestContextHelpers.ts";
import { abortMultipartUploads } from "../../upload/abortMultipartUploads/abortMultipartUploads.ts";
import { getMultipartUploadRefFromFile } from "../../upload/abortMultipartUploads/getMultipartUploadRefFromFile.ts";
import { type MultipartUploadRef } from "../../upload/abortMultipartUploads/abortMultipartUploads.types.ts";
import {
  DERIVATIVE_PURPOSES,
  makeUploadStorageKeyFromRendition,
} from "../../upload/presignUploadFile/uploadStorageKeyHelpers.ts";
import { makeUploadFileDtosFromRows } from "../../upload/readUploadFilePage/makeUploadFileDtosFromRows.ts";
import {
  assertMayUpload,
  getOwnUploadSessionFromSessionIdOr404,
  getUploadFileFromFileIdOr404,
  type UploadFileRow,
} from "../../upload/uploadSessionAccessHelpers.ts";

/** Inputs for _retryInTransaction. */
type RetryInTransactionOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  sessionId: string;
  fileId: string;
  now: string;
};

/**
 * Every storage key a file's transfer writes or has written: the key its row
 * names for the original (or the one a presign would give it, for a row that
 * never got that far), and one per derivative the browser sends.
 */
function _getStorageKeysFromFile(file: UploadFileRow): string[] {
  const keyOptions = {
    sessionId: file.upload_session_id,
    fileId: file.id,
    declaredContentType: file.declared_content_type,
  };
  const keys = new Set<string>([
    makeUploadStorageKeyFromRendition({ ...keyOptions, purpose: "original" }),
    ...DERIVATIVE_PURPOSES.map((purpose) => {
      return makeUploadStorageKeyFromRendition({ ...keyOptions, purpose });
    }),
  ]);
  if (file.storage_key !== null) {
    keys.add(file.storage_key);
  }
  return [...keys];
}

/**
 * A `failed` row back to `waiting`, with what the failure left cleared and
 * its attempts kept, so a retry stays visible as one.
 *
 * One update on the file, plus the session's `last_activity_at`.
 *
 * @returns The row as it now stands.
 */
async function _putFailedFileBackToWaiting(options: {
  transaction: DatabaseExecutor;
  file: UploadFileRow;
  now: string;
}): Promise<UploadFileRow> {
  const { transaction, file, now } = options;
  // A refused file is refused by kind, and is never retryable.
  if (file.state !== "failed") {
    throw ApiError.conflict({
      code: "upload_file_conflict",
      details: { state: file.state },
    });
  }
  const fileRow = await transaction
    .updateTable("upload_files")
    .set({
      state: "waiting",
      problem_code: null,
      problem_detail: null,
      presigned_until: null,
      multipart_upload_id: null,
      updated_at: now,
    })
    .where("id", "=", file.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", file.upload_session_id)
    .execute();
  return fileRow;
}

/**
 * The retry's one transaction, in the contract's order: the session for its
 * own uploader or one 404, then the role, then the file, then the update,
 * then the file's keys leave the deletion queue.
 */
async function _retryInTransaction(
  options: RetryInTransactionOptions,
): Promise<{
  fileRow: UploadFileRow;
  isIncludedInEmail: boolean;
  staleUpload: MultipartUploadRef | undefined;
}> {
  const { transaction, viewer, sessionId } = options;
  const session = await getOwnUploadSessionFromSessionIdOr404({
    database: transaction,
    viewer,
    sessionId,
  });
  assertMayUpload(viewer);
  const file = await getUploadFileFromFileIdOr404({
    database: transaction,
    sessionId,
    fileId: options.fileId,
  });
  const fileRow = await _putFailedFileBackToWaiting({
    transaction,
    file,
    now: options.now,
  });
  await (async (sourceOptions: {
    transaction: DatabaseExecutor;
    file: UploadFileRow;
  }): Promise<void> => {
    await sourceOptions.transaction
      .deleteFrom("pending_object_deletions")
      .where("storage_key", "in", _getStorageKeysFromFile(sourceOptions.file))
      .execute();
  })({ transaction, file });
  return {
    fileRow,
    isIncludedInEmail: session.settled_at === null,
    staleUpload: getMultipartUploadRefFromFile(file),
  };
}

/**
 * `POST /upload-sessions/:sessionId/files/:fileId/retry`: "Try the one that
 * dropped".
 *
 * `isIncludedInEmail` is `settled_at IS NULL`, read in the same
 * transaction: after a batch has settled the latch will not fire twice, so
 * the recovered photograph appears silently and the surface must not
 * promise mail. The file's keys leave `pending_object_deletions` in the same
 * transaction, since a retry reuses them. A multipart upload the row still
 * named is aborted after the
 * commit, outside the transaction, and the file is composed after it too,
 * by `readUploadFileDtos`, because that signs URLs.
 */
export async function postUploadFileRetry(
  request: FastifyRequest,
): Promise<RetryUploadFileResponse> {
  const viewer = requireViewer(request);
  const { sessionId, fileId } = uploadFileParamsSchema.parse(request.params);
  const { database, b2 } = request.server;
  const now = request.server.clock();

  const retried = await withUploadObjectCleanupLock({
    database,
    callback: () => {
      return runInImmediateTransaction({
        database,
        callback: (transaction) => {
          return _retryInTransaction({
            transaction,
            viewer,
            sessionId,
            fileId,
            now: now.toISOString(),
          });
        },
      });
    },
  });

  await abortMultipartUploads({
    database,
    b2,
    uploads: retried.staleUpload === undefined ? [] : [retried.staleUpload],
    logger: request.log,
  });
  const [file] = await makeUploadFileDtosFromRows({
    database,
    b2,
    fileRows: [retried.fileRow],
    now,
  });
  if (file === undefined) {
    throw new Error(`no file DTO was made for upload file ${fileId}`);
  }
  return { file, isIncludedInEmail: retried.isIncludedInEmail };
}
