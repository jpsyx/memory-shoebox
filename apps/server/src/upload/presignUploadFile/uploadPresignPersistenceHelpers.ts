import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { getUploadFileFromFileIdOr404 } from "../uploadSessionAccessHelpers.ts";

import type {
  PresignContext,
  SignedOriginal,
  MarkPresignedOptions,
  HashHolder,
} from "./presignUploadFile.types.ts";

import { assertUploadUnchangedSinceSigning } from "./assertUploadUnchangedSinceSigning.ts";

import {
  getHashHolderFromPresignContext,
  cancelDuplicateUploadFile,
  makeDuplicateConflictFromHashHolder,
} from "./uploadDuplicateHelpers.ts";

/**
 * Aborts a multipart upload this call opened and could not record, outside
 * any transaction, so Backblaze does not bill parts nothing will name.
 */
async function _abortOrphanedUpload(
  options: Readonly<{
    context: PresignContext;
    signed: SignedOriginal;
  }>,
): Promise<void> {
  const uploadId = options.signed.openedUploadId;
  if (uploadId === undefined) {
    return;
  }
  try {
    await options.context.b2.abortMultipart({
      key: options.signed.storageKey,
      uploadId,
    });
  } catch (error) {
    options.context.logger.warn(
      { err: error, fileId: options.context.file.id },
      "could not abort a multipart upload this presign opened and never recorded",
    );
  }
}

/**
 * Everything the presign decided, on the row, with the session's
 * `last_activity_at`: the hash, the key, the expiry, the upload id, and one
 * more attempt.
 *
 * `presigned_until` is the latest presign's expiry and nothing more. A
 * re-presign of some parts moves it forward while the URLs signed earlier for
 * the other parts may expire sooner, so nothing may read it as a guarantee
 * that every URL still works; the browser learns of an expiry from Backblaze's
 * `403` and presigns again.
 */
async function _markPresigned(options: MarkPresignedOptions): Promise<void> {
  const { transaction, context, signed, file } = options;
  await transaction
    .updateTable("upload_files")
    .set((expressionBuilder) => {
      return {
        content_hash: context.input.contentHash,
        storage_key: signed.storageKey,
        presigned_until: context.expiresAt,
        multipart_upload_id: signed.multipartUploadId ?? null,
        attempt_count: expressionBuilder("attempt_count", "+", 1),
        state: "sending",
        updated_at: context.now,
      };
    })
    .where("id", "=", file.id)
    .execute();
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: context.now })
    .where("id", "=", file.upload_session_id)
    .execute();
}

/**
 * Inside the write: re-read the row, re-check it against what was signed,
 * and write everything the presign decided. A row that turns out to
 * duplicate another is cancelled here instead, and its holder returned.
 */
async function _writeOriginalPresign(options: {
  transaction: DatabaseExecutor;
  context: PresignContext;
  signed: SignedOriginal;
}): Promise<HashHolder | undefined> {
  const { transaction, context, signed } = options;
  const current = await getUploadFileFromFileIdOr404({
    database: transaction,
    sessionId: context.file.upload_session_id,
    fileId: context.file.id,
  });
  assertUploadUnchangedSinceSigning({
    planned: context.file,
    current,
    contentHash: context.input.contentHash,
  });
  const holder = await getHashHolderFromPresignContext({
    database: transaction,
    file: current,
    contentHash: context.input.contentHash,
  });
  if (holder !== undefined) {
    await cancelDuplicateUploadFile({
      transaction,
      file: current,
      holder,
      now: context.now,
    });
    return holder;
  }
  await _markPresigned({ transaction, context, signed, file: current });
  return undefined;
}

/**
 * The one short transaction after Backblaze has answered: re-read the row,
 * re-check it, and write everything the presign decided together, with the
 * session's `last_activity_at`. A multipart upload this call opened and could
 * not record, because the write refused or the row lost a race to a
 * duplicate, is aborted after it.
 */
export async function recordUploadOriginalPresign(
  options: Readonly<{
    context: PresignContext;
    signed: SignedOriginal;
  }>,
): Promise<void> {
  const { context, signed } = options;
  const holder = await runInImmediateTransaction({
    database: context.database,
    callback: (transaction) => {
      return _writeOriginalPresign({ transaction, context, signed });
    },
  }).catch(async (error: unknown) => {
    await _abortOrphanedUpload({ context, signed });
    throw error;
  });
  if (holder !== undefined) {
    await _abortOrphanedUpload({ context, signed });
    throw makeDuplicateConflictFromHashHolder(holder);
  }
}

/**
 * Marks a derivative's presign as activity, on the batch and on the file: the
 * batch's `last_activity_at` is what the sweep reads while it is uploading,
 * and the file's `updated_at` is what it reads for a file retried after the
 * batch settled. One short transaction, after Backblaze has answered.
 */
export async function markUploadDerivativeActivity(
  context: Readonly<PresignContext>,
): Promise<void> {
  const { file } = context;
  await runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      await transaction
        .updateTable("upload_files")
        .set({ updated_at: context.now })
        .where("id", "=", file.id)
        .execute();
      await transaction
        .updateTable("upload_sessions")
        .set({ last_activity_at: context.now })
        .where("id", "=", file.upload_session_id)
        .execute();
    },
  });
}
