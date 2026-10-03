import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { ApiError } from "../../http/ApiError.ts";

import { settleUploadSession } from "../settleUploadSession.ts";

import {
  getUploadFileFromFileIdOr404,
  type UploadFileRow,
} from "../uploadSessionAccessHelpers.ts";

import type {
  HashHolder,
  CancelDuplicateOptions,
  PresignContext,
} from "./presignUploadFile.types.ts";

import { assertUploadUnchangedSinceSigning } from "./assertUploadUnchangedSinceSigning.ts";

/**
 * The other row of this session that already holds these bytes, or nothing.
 *
 * Read before any Backblaze call, so a duplicate never opens a multipart
 * upload, and again inside the write, which is what keeps the partial unique
 * index on `(upload_session_id, content_hash)` from ever turning a race into
 * a 500. A row that already carries a hash has none to collide with.
 */
export async function getHashHolderFromPresignContext(
  options: Readonly<{
    database: DatabaseExecutor;
    file: UploadFileRow;
    contentHash: string;
  }>,
): Promise<HashHolder | undefined> {
  if (options.file.content_hash !== null) {
    return undefined;
  }
  return options.database
    .selectFrom("upload_files")
    .select([
      "upload_files.id as fileId",
      "upload_files.original_filename as originalFilename",
    ])
    .where(
      "upload_files.upload_session_id",
      "=",
      options.file.upload_session_id,
    )
    .where("upload_files.content_hash", "=", options.contentHash)
    .where("upload_files.id", "!=", options.file.id)
    .executeTakeFirst();
}

/**
 * A duplicate is cancelled, not failed (design decision 15): a failed row
 * would show as a casualty with a retry that can never succeed, and a row
 * left `waiting` would hold the latch open. Cancelling is a terminal
 * transition, so the latch runs in the same transaction. `problem_code`
 * stays null, as a draft cancel leaves it: the column has no duplicate code.
 */
export async function cancelDuplicateUploadFile(
  options: Readonly<CancelDuplicateOptions>,
): Promise<void> {
  const { transaction, file, now } = options;
  await transaction
    .updateTable("upload_files")
    .set({
      state: "cancelled",
      problem_code: null,
      problem_detail: `Identical to ${options.holder.originalFilename}, which is already in this batch.`,
      presigned_until: null,
      updated_at: now,
    })
    .where("id", "=", file.id)
    .execute();
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", file.upload_session_id)
    .execute();
  await settleUploadSession({
    transaction,
    sessionId: file.upload_session_id,
    now,
  });
}

/**
 * The 409 a duplicate answers with: the row holding the bytes, and its own
 * end.
 */
export function makeDuplicateConflictFromHashHolder(
  holder: HashHolder,
): ApiError {
  return ApiError.conflict({
    code: "upload_file_conflict",
    details: {
      fileId: holder.fileId,
      state: "cancelled",
    },
  });
}

/**
 * A duplicate found before any Backblaze call: cancelled in one short
 * transaction, which re-reads the row first, then the 409.
 */
export async function cancelDuplicateBeforeSigning(
  options: Readonly<{
    context: PresignContext;
    holder: HashHolder;
  }>,
): Promise<never> {
  const { context, holder } = options;
  await runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
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
      await cancelDuplicateUploadFile({
        transaction,
        file: current,
        holder,
        now: context.now,
      });
    },
  });
  throw makeDuplicateConflictFromHashHolder(holder);
}
