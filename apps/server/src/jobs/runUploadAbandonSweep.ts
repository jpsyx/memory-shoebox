import { sql, type Kysely, type SqlBool } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/client/client.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Database } from "../db/types/db.types.ts";
import {
  abortMultipartUploads,
  getMultipartUploadRefFromFile,
} from "../upload/abortMultipartUploads.ts";
import {
  enqueueOrphanedUploadObjects,
  type OrphanableUploadFile,
} from "../upload/enqueueOrphanedUploadObjects.ts";
import { settleUploadSession } from "../upload/settleUploadSession.ts";

/** What one run changed. */
export type UploadAbandonSweepSummary = {
  abandonedFileCount: number;
  cancelledDraftCount: number;
  settledSessionCount: number;
  abortedMultipartCount: number;
};

/** Non-terminal file states: nothing else can still be waiting on a transfer. */
const IN_FLIGHT_FILE_STATES = ["waiting", "sending"] as const;

/**
 * The states a row can still hold a multipart upload in once its abort has
 * failed: abandoned here, failed by `complete`, or cancelled by `commit`. A
 * `done` row has no id left, and a retried one is `waiting` with it cleared.
 */
const LEFTOVER_UPLOAD_FILE_STATES = ["failed", "cancelled"] as const;

/** What one batch's own transaction did. */
type AbandonedBatch = { abandonedFileCount: number; didSettle: boolean };

/** What the committed half did, and the batches it could not finish. */
type CommittedHalf = {
  abandonedFileCount: number;
  settledSessionCount: number;
  failures: Array<{ sessionId: string; error: unknown }>;
};

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
async function _failIdleInFlightFiles(options: {
  transaction: Kysely<Database>;
  sessionId: string;
  sessionsIdleBefore: string;
  now: string;
}): Promise<OrphanableUploadFile[]> {
  return options.transaction
    .updateTable("upload_files")
    .set({
      state: "failed",
      problem_code: "abandoned",
      problem_detail: "The upload stopped and did not come back.",
      updated_at: options.now,
    })
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
    .returning([
      "id",
      "upload_session_id",
      "declared_content_type",
      "storage_key",
      "multipart_upload_id",
      "item_id",
    ])
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
 * (step 6a design, decision 18). **And it is one transaction per batch, not
 * one for the run**, so a batch whose settle fails rolls back alone and is
 * found again next run, while the others settle.
 */
async function _abandonBatchAndSettle(options: {
  database: Kysely<Database>;
  sessionId: string;
  sessionsIdleBefore: string;
  now: string;
}): Promise<AbandonedBatch> {
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
async function _abandonIdleBatches(options: {
  database: Kysely<Database>;
  sessionsIdleBefore: string;
  now: string;
}): Promise<CommittedHalf> {
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
      half.failures.push({ sessionId, error });
    }
  }
  return half;
}

/**
 * Surfaces the batches the committed half could not finish, once the rest of
 * the run is done. A job takes no logger, so the runner's own "job failed" log
 * is where this is seen; each failed batch rolled back whole and is found
 * again by the next run.
 */
function _throwIfAnyBatchFailed(failures: CommittedHalf["failures"]): void {
  if (failures.length === 0) {
    return;
  }
  const sessionIds = failures.map((failure) => {
    return failure.sessionId;
  });
  throw new AggregateError(
    failures.map((failure) => {
      return failure.error;
    }),
    `the abandon sweep could not finish upload sessions ${sessionIds.join(", ")}; every other half ran, and the next run tries these again`,
  );
}

/**
 * Every failed or cancelled file still holding a multipart upload, from this
 * run or any earlier abort that failed, aborted so Backblaze stops billing
 * the parts. **After the transaction has committed** (step 6a design,
 * decision 2): a network round trip inside it would hold SQLite's one write
 * lock.
 *
 * Not limited to the sessions this run touched, because a retry is the
 * point: a batch settled last run is not touched again, and its failed abort
 * would otherwise never be retried. `abortMultipartUploads` clears an id only
 * once Backblaze has let go of the upload, and only where the row still holds
 * it, so a failure leaves the row exactly as it was for the next run.
 */
async function _abortLeftoverMultipartUploads(options: {
  database: Kysely<Database>;
  b2: B2Client;
}): Promise<number> {
  const rows = await options.database
    .selectFrom("upload_files")
    .select(["id", "storage_key", "multipart_upload_id"])
    .where("state", "in", [...LEFTOVER_UPLOAD_FILE_STATES])
    .where("multipart_upload_id", "is not", null)
    .execute();
  const { abortedCount } = await abortMultipartUploads({
    database: options.database,
    b2: options.b2,
    uploads: rows.flatMap((row) => {
      const upload = getMultipartUploadRefFromFile(row);
      return upload === null ? [] : [upload];
    }),
  });
  return abortedCount;
}

/**
 * Two jobs in one, because both mean "this batch is not coming back"
 * (`conventions.md` § The job runner).
 *
 * **The committed half**, from `apis/upload.md` § `upload-abandon-sweep`: a
 * committed batch idle past `appConfig.upload.abandonGraceMinutes` has its
 * still in-flight files failed as `abandoned`, and then the settle latch runs
 * for it, in the same transaction, which is how a closed browser still tells
 * everybody about the two hundred files that did arrive. **Each batch has a
 * transaction of its own**, so one whose settle throws rolls back alone: the
 * others settle, the draft half and the aborts still run, and the failure is
 * thrown at the very end for the runner to log, the batch left as it was for
 * the next run. **The measure is the session, not the file**: `last_activity_at` is
 * bumped by presign and complete, and a single large video's own row is
 * touched only at presign, so a per-file measure would fail a transfer that
 * is going perfectly well.
 *
 * `settled_at IS NULL` rather than `state = 'uploading'`, because that is the
 * latch's own condition, so the sweep and the latch cannot drift apart.
 *
 * **What an abandoned file may have left in the bucket** (a single PUT that
 * landed, or its derivatives) is enqueued into `pending_object_deletions` in
 * that batch's transaction, for `object-deletion-drain` to delete (step 6a
 * design, decision 18).
 *
 * **The multipart aborts** run after that transaction commits, never inside
 * it, through `abortMultipartUploads`, and any abort that failed before, here
 * or in a route, is retried on the next run (step 6a design, decision 2).
 *
 * **The draft half.** A pre-commit draft idle past
 * `appConfig.upload.draftExpiryHours` is cancelled. The latch cannot reach
 * these, because it requires `committed_at IS NOT NULL`, and one member may
 * have only one open session, so an abandoned draft would block them. The two
 * halves cannot touch the same row.
 *
 * @param options.database The catalog.
 * @param options.b2 Backblaze, called only outside the transaction.
 * @param options.now The run's time.
 * @returns What this run changed.
 */
export async function runUploadAbandonSweep(options: {
  database: Kysely<Database>;
  b2: B2Client;
  now: string;
}): Promise<UploadAbandonSweepSummary> {
  const nowMs = Date.parse(options.now);
  const sessionsIdleBefore = new Date(
    nowMs - appConfig.upload.abandonGraceMinutes * 60_000,
  ).toISOString();
  const draftsIdleBefore = new Date(
    nowMs - appConfig.upload.draftExpiryHours * 3_600_000,
  ).toISOString();

  const committedHalf = await _abandonIdleBatches({
    database: options.database,
    sessionsIdleBefore,
    now: options.now,
  });

  const cancelledDrafts = await options.database
    .updateTable("upload_sessions")
    .set({ state: "cancelled", last_activity_at: options.now })
    .where("state", "=", "draft")
    .where("committed_at", "is", null)
    .where("last_activity_at", "<=", draftsIdleBefore)
    .executeTakeFirst();

  const abortedMultipartCount = await _abortLeftoverMultipartUploads(options);

  _throwIfAnyBatchFailed(committedHalf.failures);
  return {
    abandonedFileCount: committedHalf.abandonedFileCount,
    cancelledDraftCount: Number(cancelledDrafts.numUpdatedRows),
    settledSessionCount: committedHalf.settledSessionCount,
    abortedMultipartCount,
  };
}
