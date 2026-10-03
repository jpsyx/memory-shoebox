import {
  type CompleteUploadFileRequest,
  type UploadProblemCode,
} from "@memory-shoebox/shared";

import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";

import { ApiError } from "../../http/ApiError.ts";

import { abortMultipartUploads } from "../abortMultipartUploads/abortMultipartUploads.ts";
import { getMultipartUploadRefFromFile } from "../abortMultipartUploads/getMultipartUploadRefFromFile.ts";
import { type MultipartUploadRef } from "../abortMultipartUploads/abortMultipartUploads.types.ts";

import {
  enqueueOrphanedUploadObjects,
  enqueueUnreportedDerivativeObjects,
} from "../enqueueOrphanedUploadObjectsHelpers.ts";

import { ingestUploadFile } from "../ingestUploadFile/ingestUploadFile.ts";

import { type IngestRendition } from "../ingestUploadFile/ingestUploadFile.types.ts";

import { settleUploadSession } from "../settleUploadSession.ts";

import {
  getUploadFileFromFileIdOr404,
  type UploadFileRow,
} from "../uploadSessionAccessHelpers.ts";

import {
  getUploadFileStateFromStoredValue,
  IN_FLIGHT_FILE_STATES,
} from "../uploadStateHelpers.ts";

import { verifyUploadedObjects } from "../verifyUploadedObjects/verifyUploadedObjects.ts";
import { type CompletedTransfer } from "../verifyUploadedObjects/verifyUploadedObjects.types.ts";

import type {
  WriteFailedOptions,
  CompleteContext,
  WriteDoneOptions,
} from "./completeUploadFile.types.ts";

/**
 * Whether a stored file state is still in flight. Every other state is
 * terminal: the latch counts it, and nothing completes it twice.
 */
function _isInFlight(state: string): boolean {
  return IN_FLIGHT_FILE_STATES.includes(
    getUploadFileStateFromStoredValue(state),
  );
}

/** A terminal row takes no second ending, and `done` needs a presign first. */
export function assertFileAcceptsOutcome(
  options: Readonly<{
    file: UploadFileRow;
    outcome: CompleteUploadFileRequest["outcome"];
  }>,
): void {
  const { file } = options;
  const isNeverPresigned =
    options.outcome === "done" && file.state === "waiting";
  if (!_isInFlight(file.state) || isNeverPresigned) {
    throw ApiError.conflict({
      code: "upload_file_conflict",
      details: { state: file.state },
    });
  }
}

/** The code a `failed` call reports, defaulting to a dropped connection. */
export function getReportedProblemCode(
  body: Readonly<CompleteUploadFileRequest>,
): UploadProblemCode {
  const problemCode = body.problemCode ?? "connection_lost";
  if (
    !(
      new Set<UploadProblemCode>([
        "connection_lost",
        "checksum_mismatch",
        "content_mismatch",
        "storage_rejected",
      ]) satisfies ReadonlySet<UploadProblemCode>
    ).has(problemCode)
  ) {
    throw ApiError.invalidRequest({
      problemCode: ["That is the server's verdict to give, not the browser's."],
    });
  }
  return problemCode;
}

/**
 * The failed row, what it may have left in the bucket, and the session's
 * `last_activity_at`, inside the caller's transaction.
 *
 * The leftovers (a single PUT that landed, the derivatives sent ahead, an
 * assembled multipart original) are queued as an abandoned row's are (design
 * decision 18): a failed file is not an item, so nothing else would ever
 * delete them. That is safe for a file that is retried later: the retry takes
 * its keys back out of the queue, and the drain checks each key against the
 * catalog before deleting it.
 */
async function _writeFailed(options: WriteFailedOptions): Promise<void> {
  const { transaction, context, current } = options;
  await transaction
    .updateTable("upload_files")
    .set({
      state: "failed",
      problem_code: options.problemCode,
      problem_detail: options.problemDetail ?? null,
      presigned_until: null,
      updated_at: context.now,
    })
    .where("id", "=", current.id)
    .execute();
  await enqueueOrphanedUploadObjects({
    transaction,
    files: [current],
    now: context.now,
  });
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: context.now })
    .where("id", "=", context.session.id)
    .execute();
}

/**
 * The row goes `failed`, what it may have left in the bucket is queued for
 * deletion, and the latch runs, in one short transaction.
 *
 * The multipart upload to abort is the one on the row as this transaction
 * found it, not the one read before the Backblaze calls: a sweep or a
 * re-presign may have changed it since.
 */
export async function failInTransaction(
  options: Readonly<{
    context: CompleteContext;
    problemCode: UploadProblemCode;
    problemDetail: string | undefined;
  }>,
): Promise<{
  didSettle: boolean;
  /** The multipart upload the row held when it failed, to abort after. */
  multipartUpload: MultipartUploadRef | undefined;
}> {
  const { context } = options;
  return runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      const current = await getUploadFileFromFileIdOr404({
        database: transaction,
        sessionId: context.session.id,
        fileId: context.file.id,
      });
      // A sweep or a racing call may have ended it since it was read.
      if (!_isInFlight(current.state)) {
        throw ApiError.conflict({
          code: "upload_file_conflict",
          details: {
            state: current.state,
          },
        });
      }
      await _writeFailed({ ...options, transaction, current });
      const { didSettle } = await settleUploadSession({
        transaction,
        sessionId: context.session.id,
        now: context.now,
      });
      return {
        didSettle,
        multipartUpload: getMultipartUploadRefFromFile(current),
      };
    },
  });
}

/** After the commit: stop Backblaze billing a multipart upload's parts. */
export async function abortMultipartUpload(
  options: Readonly<{
    context: CompleteContext;
    upload: MultipartUploadRef | undefined;
  }>,
): Promise<void> {
  const { context, upload } = options;
  if (upload === undefined) {
    return;
  }
  await abortMultipartUploads({
    database: context.database,
    b2: context.b2,
    uploads: [upload],
    logger: context.logger,
  });
}

/**
 * The verified file's row, its item, the derivative keys it did not report
 * queued for deletion, and the session's `last_activity_at`.
 */
async function _writeDone(
  options: Readonly<Omit<WriteDoneOptions, "renditions">> &
    Readonly<{ renditions: readonly IngestRendition[] }>,
): Promise<void> {
  const { transaction, context, current, transfer } = options;
  await transaction
    .updateTable("upload_files")
    .set({
      state: "done",
      width: transfer.width,
      height: transfer.height,
      duration_ms: transfer.durationMs ?? null,
      presigned_until: null,
      multipart_upload_id: null,
      problem_code: null,
      problem_detail: null,
      updated_at: context.now,
    })
    .where("id", "=", current.id)
    .execute();
  await ingestUploadFile({
    transaction,
    session: context.session,
    file: current,
    dimensions: transfer,
    renditions: options.renditions,
    now: context.now,
  });
  await enqueueUnreportedDerivativeObjects({
    transaction,
    file: current,
    reportedPurposes: options.renditions.map((rendition) => {
      return rendition.purpose;
    }),
    now: context.now,
  });
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: context.now })
    .where("id", "=", context.session.id)
    .execute();
}

/**
 * The one transaction of a verified `done`: the row, the item, the bump and
 * the latch. It calls nothing outside SQLite.
 */
async function _markDoneInTransaction(options: {
  context: CompleteContext;
  transfer: CompletedTransfer;
  renditions: readonly IngestRendition[];
}): Promise<{ didSettle: boolean }> {
  const { context, transfer } = options;
  return runInImmediateTransaction({
    database: context.database,
    callback: async (transaction) => {
      const current = await getUploadFileFromFileIdOr404({
        database: transaction,
        sessionId: context.session.id,
        fileId: context.file.id,
      });
      // A double-clicked complete that lost the race is still a repeat.
      if (
        current.state === "done" &&
        current.content_hash === transfer.contentHash
      ) {
        return { didSettle: false };
      }
      // What was verified is what is on the row now: the same state, the
      // same multipart upload, the same attempt. A sweep, a commit that
      // closed the batch or a re-presign may have moved it in between.
      const isUnchanged =
        current.state === "sending" &&
        current.multipart_upload_id === context.file.multipart_upload_id &&
        current.attempt_count === context.file.attempt_count;
      if (!isUnchanged) {
        throw ApiError.conflict({
          code: "upload_file_conflict",
          details: {
            state: current.state,
          },
        });
      }
      await _writeDone({ ...options, transaction, current });
      return settleUploadSession({
        transaction,
        sessionId: context.session.id,
        now: context.now,
      });
    },
  });
}

/**
 * `outcome: "done"`: verify everything in Backblaze, then write once.
 *
 * A disagreement fails the row (and runs the latch) before the 409 goes out;
 * a Backblaze failure throws the 503 from `verifyUploadedObjects` before any
 * write, leaving the row `sending`.
 */
export async function completeAsDone(
  options: Readonly<{
    context: CompleteContext;
    transfer: CompletedTransfer;
  }>,
): Promise<{ didSettle: boolean }> {
  const { context, transfer } = options;
  const verification = await verifyUploadedObjects({
    b2: context.b2,
    file: context.file,
    transfer,
  });
  if (!verification.isVerified) {
    const failed = await failInTransaction({
      context,
      problemCode: verification.problemCode,
      problemDetail: verification.problemDetail,
    });
    await abortMultipartUpload({ context, upload: failed.multipartUpload });
    throw ApiError.conflict({
      code: "upload_file_conflict",
      details: { state: "failed" },
    });
  }
  return _markDoneInTransaction({
    context,
    transfer,
    renditions: verification.renditions,
  });
}
