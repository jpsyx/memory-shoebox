import { sql, type Kysely, type SqlBool } from "kysely";
import { appConfig } from "../../../../app.config.ts";
import type { Database } from "../db/types.ts";

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
 * **The committed half.** A batch whose browser was closed leaves `waiting`
 * and `sending` rows that nothing will ever finish. They become `failed` with
 * `problem_code = 'abandoned'`, measured against `upload_files.updated_at` so
 * a batch where most files landed loses only the ones that did not.
 *
 * **The draft half.** A pre-commit draft idle past
 * `appConfig.upload.draftExpiryHours` is cancelled. The settle latch cannot
 * reach these, because it requires `committed_at IS NOT NULL`, and one member
 * may have only one open session, so an abandoned draft blocks them from
 * starting another until something clears it.
 *
 * The two halves cannot touch the same row: the file half looks only at
 * sessions that are `uploading` and committed, and the draft half only at
 * sessions that are `draft` and not.
 *
 * **The settle latch is deliberately not here.** Marking the last in-flight
 * file terminal is what makes a batch eligible to settle and notify, and that
 * latch belongs to step 6a with the rest of the upload slice
 * (`data-models.md` § Exactly one email when the last file lands). Step 6a
 * calls it from this function, after both halves have run.
 *
 * Aborting the Backblaze multipart upload behind an abandoned row belongs to
 * the same step, for the same reason: this job takes no Backblaze client, and
 * `apis/upload.md` § `upload-abandon-sweep` wants the abort so unfinished
 * parts stop being billed.
 */
export async function runUploadAbandonSweep(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<UploadAbandonSweepSummary> {
  const nowMs = Date.parse(options.now);
  const abandonBefore = new Date(
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
    .where("updated_at", "<=", abandonBefore)
    .where(
      sql<SqlBool>`EXISTS (
        SELECT 1 FROM upload_sessions
        WHERE upload_sessions.id = upload_files.upload_session_id
          AND upload_sessions.committed_at IS NOT NULL
          AND upload_sessions.state = 'uploading'
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
