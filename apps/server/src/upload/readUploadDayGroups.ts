import type { MilestoneRef, UploadDayGroup } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { NEVER_LANDING_FILE_STATES } from "./uploadStateHelpers.ts";

/** One milestone on one day, from either source below. */
type MilestoneDayRow = {
  captureDate: string | null;
  milestoneId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  blurb: string | null;
};

/** The milestone columns both sources select, in `MilestoneDayRow`'s order. */
const MILESTONE_DAY_COLUMNS = [
  "upload_files.capture_date as captureDate",
  "milestones.id as milestoneId",
  "milestones.name as name",
  "milestones.starts_on as startsOn",
  "milestones.ends_on as endsOn",
  "milestones.blurb as blurb",
] as const;

/** One aggregate: how many landing files fall on each day. */
async function _readDayCounts(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<Array<{ captureDate: string | null; fileCount: number }>> {
  return options.database
    .selectFrom("upload_files")
    .select((eb) => {
      return [
        "upload_files.capture_date as captureDate",
        eb.fn.countAll<number>().as("fileCount"),
      ];
    })
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .where("upload_files.state", "not in", [...NEVER_LANDING_FILE_STATES])
    .where("upload_files.capture_date", "is not", null)
    .groupBy("upload_files.capture_date")
    .orderBy("upload_files.capture_date", "asc")
    .execute();
}

/**
 * Before ingest: kind `milestone` edits, not undone, whose targets have not
 * landed yet (state is not `done`), on the day each target will land.
 *
 * Keyed on the file's state and not on `item_id IS NULL`: the column is
 * `ON DELETE SET NULL`, so a landed file whose item was later deleted would
 * otherwise fall back to the plan and bring its milestone back. A done file
 * takes its milestones from `item_milestones`, or has none if its item is gone.
 */
async function _readPlannedMilestoneDays(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<MilestoneDayRow[]> {
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
    .select(MILESTONE_DAY_COLUMNS)
    .distinct()
    .where("upload_batch_edits.upload_session_id", "=", options.sessionId)
    .where("upload_batch_edits.kind", "=", "milestone")
    .where("upload_batch_edits.undone_at", "is", null)
    .where("upload_files.state", "<>", "done")
    .where("upload_files.state", "not in", [...NEVER_LANDING_FILE_STATES])
    .execute();
}

/** After ingest: what `item_milestones` says about this session's items. */
async function _readAttachedMilestoneDays(options: {
  database: DatabaseExecutor;
  sessionId: string;
}): Promise<MilestoneDayRow[]> {
  return options.database
    .selectFrom("upload_files")
    .innerJoin(
      "item_milestones",
      "item_milestones.item_id",
      "upload_files.item_id",
    )
    .innerJoin("milestones", "milestones.id", "item_milestones.milestone_id")
    .select(MILESTONE_DAY_COLUMNS)
    .distinct()
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .where("upload_files.state", "not in", [...NEVER_LANDING_FILE_STATES])
    .execute();
}

/**
 * Both sources merged per day: one entry per milestone, earliest span first,
 * so a milestone named by the plan and already attached to an ingested item
 * on the same day is listed once.
 */
function _groupMilestonesByDay(
  rows: readonly MilestoneDayRow[],
): Map<string, MilestoneRef[]> {
  const byDay = rows.reduce<Map<string, Map<string, MilestoneRef>>>(
    (grouped, row) => {
      if (row.captureDate === null) {
        return grouped;
      }
      const day = grouped.get(row.captureDate) ?? new Map();
      day.set(row.milestoneId, {
        milestoneId: row.milestoneId,
        name: row.name,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        blurb: row.blurb,
      });
      grouped.set(row.captureDate, day);
      return grouped;
    },
    new Map(),
  );
  return new Map(
    [...byDay.entries()].map(([day, milestones]) => {
      return [
        day,
        [...milestones.values()].sort((first, second) => {
          return (
            first.startsOn.localeCompare(second.startsOn) ||
            first.milestoneId.localeCompare(second.milestoneId)
          );
        }),
      ];
    }),
  );
}

/**
 * `UploadSessionDetail.days`: the manifest grouped by `capture_date`, which
 * is where each file will land in the archive.
 *
 * **One aggregate for the counts, not a loop over days**, plus one query per
 * milestone source. A day's milestones come from the edit plan for the files
 * that have not landed (state is not `done`) and from `item_milestones` for
 * the ones that have, so a half-ingested day reads the same as a whole one.
 * Refused and cancelled files never land and are left out; a failed one can
 * still be retried and stays. The list is returned whole, earliest day first:
 * picking one band per day is the timeline's Decision 14, not this route's.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 */
export async function readUploadDayGroups(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<UploadDayGroup[]> {
  const [counts, planned, attached] = await Promise.all([
    _readDayCounts(options),
    _readPlannedMilestoneDays(options),
    _readAttachedMilestoneDays(options),
  ]);
  const milestonesByDay = _groupMilestonesByDay([...planned, ...attached]);

  return counts.flatMap((row) => {
    return row.captureDate === null
      ? []
      : [
          {
            capturedOn: row.captureDate,
            fileCount: Number(row.fileCount),
            milestones: milestonesByDay.get(row.captureDate) ?? [],
          },
        ];
  });
}
