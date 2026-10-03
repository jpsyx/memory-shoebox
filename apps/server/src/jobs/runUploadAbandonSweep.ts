import { sql, type Kysely, type SqlBool } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/client/client.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Database } from "../db/types/db.types.ts";
import {
  abortMultipartUploads,
  getMultipartUploadRefFromFile,
} from "../upload/abortMultipartUploads.ts";
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

/**
 * Fails every in-flight file of a committed batch idle past the grace period
 * as `abandoned`, and returns the batch of each row it changed.
 *
 * **`RETURNING upload_session_id`, rather than selecting idle sessions
 * first**, because it names exactly the batches whose rows this statement
 * changed, with no second scan and nothing that could differ between a
 * select and the update.
 */
async function _failIdleInFlightFiles(options: {
  transaction: Kysely<Database>;
  sessionsIdleBefore: string;
  now: string;
}): Promise<Array<{ upload_session_id: string }>> {
  return options.transaction
    .updateTable("upload_files")
    .set({
      state: "failed",
      problem_code: "abandoned",
      problem_detail: "The upload stopped and did not come back.",
      updated_at: options.now,
    })
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
    .returning("upload_session_id")
    .execute();
}

/**
 * The committed half, in one transaction: fail the idle files, then run the
 * latch once per batch that touched.
 *
 * The settles have to share the `UPDATE`'s transaction. Separated, a crash in
 * between would leave a batch whose files are all terminal and which no
 * later run's `UPDATE` touches again, so it would never settle and nobody
 * would be told.
 */
async function _abandonIdleFilesAndSettle(options: {
  transaction: Kysely<Database>;
  sessionsIdleBefore: string;
  now: string;
}): Promise<{ abandonedFileCount: number; settledSessionCount: number }> {
  const abandonedRows = await _failIdleInFlightFiles(options);
  const sessionIds = [
    ...new Set(
      abandonedRows.map((row) => {
        return row.upload_session_id;
      }),
    ),
  ];
  const settled = await Promise.all(
    sessionIds.map((sessionId) => {
      return settleUploadSession({
        transaction: options.transaction,
        sessionId,
        now: options.now,
      });
    }),
  );
  return {
    abandonedFileCount: abandonedRows.length,
    settledSessionCount: settled.filter((result) => {
      return result.didSettle;
    }).length,
  };
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
 * once for each batch that touched, in the same transaction, which is how a
 * closed browser still tells everybody about the two hundred files that did
 * arrive. **The measure is the session, not the file**: `last_activity_at` is
 * bumped by presign and complete, and a single large video's own row is
 * touched only at presign, so a per-file measure would fail a transfer that
 * is going perfectly well.
 *
 * `settled_at IS NULL` rather than `state = 'uploading'`, because that is the
 * latch's own condition, so the sweep and the latch cannot drift apart.
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

  const committedHalf = await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      return _abandonIdleFilesAndSettle({
        transaction,
        sessionsIdleBefore,
        now: options.now,
      });
    },
  });

  const cancelledDrafts = await options.database
    .updateTable("upload_sessions")
    .set({ state: "cancelled", last_activity_at: options.now })
    .where("state", "=", "draft")
    .where("committed_at", "is", null)
    .where("last_activity_at", "<=", draftsIdleBefore)
    .executeTakeFirst();

  const abortedMultipartCount = await _abortLeftoverMultipartUploads(options);

  return {
    ...committedHalf,
    cancelledDraftCount: Number(cancelledDrafts.numUpdatedRows),
    abortedMultipartCount,
  };
}
