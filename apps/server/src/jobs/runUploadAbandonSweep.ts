import { sql, type Kysely, type SqlBool } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import type { Database } from "../db/types/db.types.ts";

/** What one run changed. */
export type UploadAbandonSweepSummary = {
  abandonedFileCount: number;
  cancelledDraftCount: number;
};

/** Non-terminal file states: nothing else can still be waiting on a transfer. */
const IN_FLIGHT_FILE_STATES = ["waiting", "sending"] as const;

/**
 * Two jobs in one, because both mean "this batch is not coming back"
 * (`conventions.md` § The job runner).
 *
 * **The committed half**, from `apis/upload.md` § `upload-abandon-sweep`. For
 * each session with `committed_at IS NOT NULL`, `settled_at IS NULL` and
 * `last_activity_at` older than `appConfig.upload.abandonGraceMinutes`, every
 * non-terminal `upload_files` row becomes `failed` with
 * `problem_code = 'abandoned'`. A batch whose browser was closed otherwise
 * leaves `waiting` and `sending` rows that nothing will ever finish, and
 * nobody is told about the two hundred files that did arrive.
 *
 * **The measure is the session, not the file.** `last_activity_at` is bumped
 * by presign and by complete rather than only at commit, precisely so the
 * sweep has a batch-level activity signal, and the specification says so where
 * it sets the grace period. Measuring each file's own `updated_at` looks
 * finer-grained and is wrong: a single large video's row is touched at presign
 * and then not again until it lands, so a per-file measure marks a transfer
 * that is going perfectly well `abandoned`, which is the exact failure the
 * grace period exists to prevent.
 *
 * `settled_at IS NULL` rather than `state = 'uploading'`, and the difference
 * is only theoretical today: `DELETE /api/upload-sessions/:sessionId` answers
 * 409 once `committed_at` is set, so a committed session is `uploading` until
 * the latch makes it `settled`, which is the same moment it gains a
 * `settled_at`. Nothing in the schema ties the two columns together, though,
 * and this is the latch's own condition, so the sweep and the latch cannot
 * drift apart. A committed session left non-terminal under any other state
 * still gets finished, which is the right outcome: its rows hold the latch
 * open forever otherwise.
 *
 * **The draft half.** A pre-commit draft idle past
 * `appConfig.upload.draftExpiryHours` is cancelled. The settle latch cannot
 * reach these, because it requires `committed_at IS NOT NULL`, and one member
 * may have only one open session, so an abandoned draft blocks them from
 * starting another until something clears it.
 *
 * The two halves cannot touch the same row: the file half looks only at
 * committed sessions, and the draft half only at uncommitted ones.
 *
 * **The settle latch is deliberately not here.** Marking the last in-flight
 * file terminal is what makes a batch eligible to settle and notify, and that
 * latch belongs to whoever owns the upload slice
 * (`data-models.md` § Exactly one email when the last file lands), and is
 * called from this function, after both halves have run.
 *
 * Aborting the Backblaze multipart upload behind an abandoned row belongs to
 * the same owner, for the same reason: this job takes no Backblaze client, and
 * `apis/upload.md` § `upload-abandon-sweep` wants the abort so unfinished
 * parts stop being billed.
 */
export async function runUploadAbandonSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<UploadAbandonSweepSummary> {
  const nowMs = Date.parse(options.now);
  const sessionsIdleBefore = new Date(
    nowMs - appConfig.upload.abandonGraceMinutes * 60_000,
  ).toISOString();
  const draftsIdleBefore = new Date(
    nowMs - appConfig.upload.draftExpiryHours * 3_600_000,
  ).toISOString();

  const abandoned = await options.database
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
          AND upload_sessions.last_activity_at <= ${sessionsIdleBefore}
      )`,
    )
    .executeTakeFirst();

  const cancelledDrafts = await options.database
    .updateTable("upload_sessions")
    .set({ state: "cancelled", last_activity_at: options.now })
    .where("state", "=", "draft")
    .where("committed_at", "is", null)
    .where("last_activity_at", "<=", draftsIdleBefore)
    .executeTakeFirst();

  return {
    abandonedFileCount: Number(abandoned.numUpdatedRows),
    cancelledDraftCount: Number(cancelledDrafts.numUpdatedRows),
  };
}
