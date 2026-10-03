import { sql, type Kysely, type SqlBool } from "kysely";

import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";

import type { Database } from "../../db/types/db.types.ts";

import {
  enqueueOrphanedUploadObjects,
  type OrphanableUploadFile,
} from "../../upload/enqueueOrphanedUploadObjectsHelpers.ts";

import { settleUploadSession } from "../../upload/settleUploadSession.ts";

import type {
  FailIdleInFlightFilesOptions,
  AbandonBatchAndSettleOptions,
  CommittedHalf,
  AbandonIdleRetriedFilesOrRecordOptions,
  SweepFailure,
} from "./runUploadAbandonSweep.types.ts";

/** Non-terminal file states: nothing else can still be waiting on a transfer. */
const IN_FLIGHT_FILE_STATES = ["waiting", "sending"] as const;

/** The columns of an abandoned row that the orphan cleanup reads. */
const ORPHANABLE_COLUMNS = [
  "id",
  "upload_session_id",
  "declared_content_type",
  "storage_key",
  "multipart_upload_id",
  "item_id",
] as const;

/** What an abandoned row says, wherever it was abandoned. */
const ABANDONED_FILE_VALUES = {
  state: "failed",
  problem_code: "abandoned",
  problem_detail: "The upload stopped and did not come back.",
} as const;

/**
 * The committed batches idle past the grace period that still have a file in
 * flight, oldest first.
 *
 * Only names the candidates. Each batch's own transaction applies the same
 * guard again under the write lock, so nothing can differ between this read
 * and the update: a batch that came back to life in between changes no row.
 */
async function _getIdleSessionIds(options: {
  database: Kysely<Database>;
  sessionsIdleBefore: string;
}): Promise<string[]> {
  const rows = await options.database
    .selectFrom("upload_sessions")
    .select("upload_sessions.id")
    .where("committed_at", "is not", null)
    .where("settled_at", "is", null)
    .where("last_activity_at", "<=", options.sessionsIdleBefore)
    .where((expressionBuilder) => {
      return expressionBuilder.exists(
        expressionBuilder
          .selectFrom("upload_files")
          .select("upload_files.id")
          .whereRef("upload_files.upload_session_id", "=", "upload_sessions.id")
          .where("upload_files.state", "in", [...IN_FLIGHT_FILE_STATES]),
      );
    })
    .orderBy("last_activity_at", "asc")
    .orderBy("upload_sessions.id", "asc")
    .execute();
  return rows.map((row) => {
    return row.id;
  });
}

/**
 * Fails every in-flight file of one committed batch idle past the grace
 * period as `abandoned`, and returns each row it changed.
 *
 * The batch's idleness is checked in the statement itself, so it is the
 * state under the write lock that decides, not the one the candidates were
 * read in. The columns returned are the ones the orphan cleanup reads.
 */
async function _failIdleInFlightFiles(
  options: FailIdleInFlightFilesOptions,
): Promise<OrphanableUploadFile[]> {
  return options.transaction
    .updateTable("upload_files")
    .set({ ...ABANDONED_FILE_VALUES, updated_at: options.now })
    .where("upload_session_id", "=", options.sessionId)
    .where("state", "in", [...IN_FLIGHT_FILE_STATES])
    .where(
      sql<SqlBool>`EXISTS (
        SELECT 1 FROM upload_sessions
        WHERE upload_sessions.id = upload_files.upload_session_id
          AND upload_sessions.committed_at IS NOT NULL
          AND upload_sessions.settled_at IS NULL
          AND upload_sessions.last_activity_at <= ${options.sessionsIdleBefore}
      )`,
    )
    .returning(ORPHANABLE_COLUMNS)
    .execute();
}

/**
 * One batch, in its own transaction: fail its idle files, queue what they may
 * have left in the bucket, run the latch.
 *
 * **The three share a transaction.** Separated, a crash in between would
 * leave a batch whose files are all terminal and which no later run's
 * `UPDATE` touches again, so it would never settle and nobody would be told.
 * The same goes for the deletions: no later run touches an `abandoned` row
 * again, so objects left unqueued by a crash would stay in the bucket for good
 *. **And it is one transaction per batch, not
 * one for the run**, so a batch whose settle fails rolls back alone and is
 * found again next run, while the others settle.
 */
async function _abandonBatchAndSettle(
  options: AbandonBatchAndSettleOptions,
): Promise<{ abandonedFileCount: number; didSettle: boolean }> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const abandonedRows = await _failIdleInFlightFiles({
        ...options,
        transaction,
      });
      if (abandonedRows.length === 0) {
        return { abandonedFileCount: 0, didSettle: false };
      }
      await enqueueOrphanedUploadObjects({
        transaction,
        files: abandonedRows,
        now: options.now,
      });
      const { didSettle } = await settleUploadSession({
        transaction,
        sessionId: options.sessionId,
        now: options.now,
      });
      return { abandonedFileCount: abandonedRows.length, didSettle };
    },
  });
}

/**
 * The committed half: every idle batch, one after another, each in its own
 * transaction. A batch that throws is recorded and skipped, never allowed to
 * stop the others.
 */
export async function abandonIdleBatches(
  options: Readonly<{
    database: Kysely<Database>;
    sessionsIdleBefore: string;
    now: string;
  }>,
): Promise<CommittedHalf> {
  const half: CommittedHalf = {
    abandonedFileCount: 0,
    settledSessionCount: 0,
    failures: [],
  };
  const sessionIds = await _getIdleSessionIds(options);
  for (const sessionId of sessionIds) {
    try {
      const batch = await _abandonBatchAndSettle({ ...options, sessionId });
      half.abandonedFileCount += batch.abandonedFileCount;
      half.settledSessionCount += batch.didSettle ? 1 : 0;
    } catch (error: unknown) {
      half.failures.push({ what: `upload session ${sessionId}`, error });
    }
  }
  return half;
}

/**
 * Files retried after their batch settled that then stopped, failed as
 * `abandoned` in one transaction with what they may have left in the bucket
 * queued for deletion.
 *
 * **Measured on the row's own `updated_at`**, not the batch's activity: once
 * a batch has settled, another retried file of it can keep
 * `last_activity_at` fresh while this one has long gone quiet. The row is
 * touched by the retry and by every original presign, and a transfer that
 * is alive contacts the server at least once a URL lifetime, which the grace
 * outlasts.
 *
 * **The latch is never run.** The batch settled and its email went out; a
 * retry after settling is never included in it (`upload.md`), so failing the
 * retry changes nobody's message. Its multipart upload, if any, is aborted
 * with every other leftover once this has committed.
 *
 * @returns How many rows it failed.
 */
async function _abandonIdleRetriedFiles(options: {
  database: Kysely<Database>;
  filesIdleBefore: string;
  now: string;
}): Promise<number> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const abandonedRows = await transaction
        .updateTable("upload_files")
        .set({ ...ABANDONED_FILE_VALUES, updated_at: options.now })
        .where("state", "in", [...IN_FLIGHT_FILE_STATES])
        .where("updated_at", "<=", options.filesIdleBefore)
        .where(
          sql<SqlBool>`EXISTS (
            SELECT 1 FROM upload_sessions
            WHERE upload_sessions.id = upload_files.upload_session_id
              AND upload_sessions.settled_at IS NOT NULL
          )`,
        )
        .returning(ORPHANABLE_COLUMNS)
        .execute();
      await enqueueOrphanedUploadObjects({
        transaction,
        files: abandonedRows,
        now: options.now,
      });
      return abandonedRows.length;
    },
  });
}

/**
 * Abandons idle retried files and records failures so the sweep can continue. A
 * failure rolls back the whole transaction; the next run finds those rows.
 */
export async function abandonIdleRetriedFilesOrRecord(
  options: AbandonIdleRetriedFilesOrRecordOptions,
): Promise<number> {
  try {
    return await _abandonIdleRetriedFiles(options);
  } catch (error: unknown) {
    options.failures.push({
      what: "the files retried after their batch settled",
      error,
    });
    return 0;
  }
}

/**
 * Surfaces what the run could not finish, once the rest of it is done: the
 * batches of the committed half, and the retried files of settled ones. A job
 * takes no logger, so the runner's own "job failed" log is where this is
 * seen; each failure rolled back whole and is found again by the next run.
 */
export function throwIfAnythingFailed(failures: readonly SweepFailure[]): void {
  if (failures.length === 0) {
    return;
  }
  const names = failures.map((failure) => {
    return failure.what;
  });
  throw new AggregateError(
    failures.map((failure) => {
      return failure.error;
    }),
    `the abandon sweep could not finish ${names.join(", ")}; every other half ran, and the next run tries these again`,
  );
}
