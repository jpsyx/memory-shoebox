import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { ApiError } from "../../http/ApiError.ts";

import { settleUploadSession } from "../settleUploadSession.ts";
import { enqueueOrphanedUploadObjects } from "../enqueueOrphanedUploadObjectsHelpers.ts";
import { abortMultipartUploads } from "../abortMultipartUploads/abortMultipartUploads.ts";
import { getMultipartUploadRefFromFile } from "../abortMultipartUploads/getMultipartUploadRefFromFile.ts";

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
 * An archive match, or another row of this batch holding these bytes.
 *
 * Read before any Backblaze call, so a duplicate never opens a multipart
 * upload, and again inside the write, which is what keeps the partial unique
 * index on `(upload_session_id, content_hash)` from ever turning a race into
 * a 500. Re-presigned rows still check the archive.
 */
export async function getHashHolderFromPresignContext(
  options: Readonly<{
    database: DatabaseExecutor;
    file: UploadFileRow;
    contentHash: string;
  }>,
): Promise<HashHolder | undefined> {
  const archived = await getArchiveHashHolderFromUpload(options);
  if (archived !== undefined) {
    return archived;
  }
  if (options.file.content_hash !== null) {
    return undefined;
  }
  const holder = await options.database
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
  return holder === undefined ? undefined : { ...holder, reason: "batch" };
}

/** Checks original bytes across the shoebox without exposing item metadata. */
export async function getArchiveHashHolderFromUpload(
  options: Readonly<{
    database: DatabaseExecutor;
    file: UploadFileRow;
    contentHash: string;
  }>,
): Promise<HashHolder | undefined> {
  const item = await options.database
    .selectFrom("items")
    .select("id")
    .where("checksum", "=", options.contentHash)
    .where("byte_size", "=", options.file.declared_bytes)
    .executeTakeFirst();
  return item === undefined
    ? undefined
    : {
        fileId: options.file.id,
        originalFilename: options.file.original_filename,
        reason: "archive",
      };
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
): Promise<{ didSettle: boolean }> {
  const { transaction, file, now } = options;
  await transaction
    .updateTable("upload_files")
    .set({
      state: "cancelled",
      problem_code: null,
      problem_detail:
        options.holder.reason === "archive"
          ? "Already in the shoebox. This file will not be uploaded."
          : `Identical to ${options.holder.originalFilename}, which is already in this batch.`,
      duplicate_reason: options.holder.reason,
      presigned_until: null,
      updated_at: now,
    })
    .where("id", "=", file.id)
    .execute();
  await enqueueOrphanedUploadObjects({ transaction, files: [file], now });
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", file.upload_session_id)
    .execute();
  return settleUploadSession({
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

async function _cancelCurrentDuplicate(
  options: Readonly<{
    transaction: DatabaseExecutor;
    context: PresignContext;
  }>,
): Promise<HashHolder | undefined> {
  const { transaction, context } = options;
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
  const currentHolder = await getHashHolderFromPresignContext({
    database: transaction,
    file: current,
    contentHash: context.input.contentHash,
  });
  if (currentHolder === undefined) {
    return undefined;
  }
  await cancelDuplicateUploadFile({
    transaction,
    file: current,
    holder: currentHolder,
    now: context.now,
  });
  return currentHolder;
}

/**
 * A duplicate found before any Backblaze call: cancelled in one short
 * transaction, which re-reads the row first, then the 409.
 */
export async function cancelDuplicateBeforeSigning(
  options: Readonly<{
    context: PresignContext;
  }>,
): Promise<void> {
  const { context } = options;
  const holder = await runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      return _cancelCurrentDuplicate({ transaction, context });
    },
  });
  if (holder !== undefined) {
    await abortDuplicateMultipartUpload(context);
    throw makeDuplicateConflictFromHashHolder(holder);
  }
}

/** Releases the prior attempt's multipart parts after cancellation commits. */
export async function abortDuplicateMultipartUpload(
  context: Readonly<PresignContext>,
): Promise<void> {
  const upload = getMultipartUploadRefFromFile(context.file);
  if (upload !== undefined) {
    await abortMultipartUploads({
      database: context.database,
      b2: context.b2,
      uploads: [upload],
      logger: context.logger,
    });
  }
}
