import type { UploadMismatchGroup } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { NEVER_LANDING_FILE_STATES } from "./uploadStateHelpers.ts";

/** One target file outside its milestone's span. */
type MismatchRow = {
  milestoneId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  blurb: string | null;
  fileId: string;
  originalFilename: string;
  captureDate: string | null;
};

/** Every planned milestone target captured outside the milestone's span. */
async function _readMismatchRows(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<MismatchRow[]> {
  return options.database
    .selectFrom("upload_batch_edit_targets")
    .innerJoin(
      "upload_batch_edits",
      "upload_batch_edits.id",
      "upload_batch_edit_targets.upload_batch_edit_id",
    )
    .innerJoin(
      "upload_files",
      "upload_files.id",
      "upload_batch_edit_targets.upload_file_id",
    )
    .innerJoin("milestones", "milestones.id", "upload_batch_edits.milestone_id")
    .select([
      "milestones.id as milestoneId",
      "milestones.name as name",
      "milestones.starts_on as startsOn",
      "milestones.ends_on as endsOn",
      "milestones.blurb as blurb",
      "upload_files.id as fileId",
      "upload_files.original_filename as originalFilename",
      "upload_files.capture_date as captureDate",
    ])
    .where("upload_batch_edits.upload_session_id", "=", options.sessionId)
    .where("upload_batch_edits.kind", "=", "milestone")
    .where("upload_batch_edits.undone_at", "is", null)
    .where("upload_files.state", "not in", [...NEVER_LANDING_FILE_STATES])
    .where((eb) => {
      // `YYYY-MM-DD` compares as text in calendar order.
      return eb.or([
        eb("upload_files.capture_date", "<", eb.ref("milestones.starts_on")),
        eb("upload_files.capture_date", ">", eb.ref("milestones.ends_on")),
      ]);
    })
    .orderBy("milestones.starts_on", "asc")
    .orderBy("milestones.id", "asc")
    .orderBy("upload_files.position", "asc")
    .execute();
}

/**
 * `UploadSessionDetail.mismatches`: the `milestone-fix` state.
 *
 * For every kind `milestone` edit, the target files whose `capture_date`
 * falls outside the milestone's `[starts_on, ends_on]`, one group per
 * milestone, in span order. A file two edits both attached to the same
 * milestone is listed once. Pre-ingest there is no `item_milestones` row, so
 * there is nothing to acknowledge and `span_mismatch_acknowledged_at` is not
 * involved.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 */
export async function readUploadMismatchGroups(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<UploadMismatchGroup[]> {
  const rows = await _readMismatchRows(options);
  const groups = rows.reduce<Map<string, UploadMismatchGroup>>(
    (byMilestone, row) => {
      const group = byMilestone.get(row.milestoneId) ?? {
        milestone: {
          milestoneId: row.milestoneId,
          name: row.name,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          blurb: row.blurb,
        },
        files: [],
      };
      const isListed = group.files.some((file) => {
        return file.fileId === row.fileId;
      });
      if (row.captureDate !== null && !isListed) {
        group.files.push({
          fileId: row.fileId,
          originalFilename: row.originalFilename,
          capturedOn: row.captureDate,
        });
      }
      byMilestone.set(row.milestoneId, group);
      return byMilestone;
    },
    new Map(),
  );
  return [...groups.values()];
}
