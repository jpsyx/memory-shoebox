import type { MilestoneRef, UploadBatchEditDto } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getUploadEditKindFromStoredValue } from "./uploadStateHelpers.ts";

/** One edit with whatever it names, before its targets are counted. */
type EditRow = {
  editId: string;
  kind: string;
  labelSnapshot: string | null;
  createdAt: string;
  undoneAt: string | null;
  appliedAt: string | null;
  tagId: string | null;
  tagName: string | null;
  personId: string | null;
  personName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  milestoneStartsOn: string | null;
  milestoneEndsOn: string | null;
  milestoneBlurb: string | null;
};

/** The columns `EditRow` is read from, in its order. */
const EDIT_ROW_COLUMNS = [
  "upload_batch_edits.id as editId",
  "upload_batch_edits.kind as kind",
  "upload_batch_edits.label_snapshot as labelSnapshot",
  "upload_batch_edits.created_at as createdAt",
  "upload_batch_edits.undone_at as undoneAt",
  "upload_batch_edits.applied_at as appliedAt",
  "tags.id as tagId",
  "tags.name as tagName",
  "people.id as personId",
  "people.display_name as personName",
  "milestones.id as milestoneId",
  "milestones.name as milestoneName",
  "milestones.starts_on as milestoneStartsOn",
  "milestones.ends_on as milestoneEndsOn",
  "milestones.blurb as milestoneBlurb",
] as const;

/** Query one of two: the edits, with the rows they name joined on. */
async function _readEditRows(options: {
  database: DatabaseExecutor;
  sessionId: string;
  editId?: string;
}): Promise<EditRow[]> {
  const base = options.database
    .selectFrom("upload_batch_edits")
    .leftJoin("tags", "tags.id", "upload_batch_edits.tag_id")
    .leftJoin("people", "people.id", "upload_batch_edits.person_id")
    .leftJoin("milestones", "milestones.id", "upload_batch_edits.milestone_id")
    .select(EDIT_ROW_COLUMNS)
    .where("upload_batch_edits.upload_session_id", "=", options.sessionId);
  // The list leaves undone edits out; one addressed edit is read either way,
  // because Undo answers with the edit it just undid.
  const filtered =
    options.editId === undefined
      ? base.where("upload_batch_edits.undone_at", "is", null)
      : base.where("upload_batch_edits.id", "=", options.editId);
  return filtered
    .orderBy("upload_batch_edits.created_at", "asc")
    .orderBy("upload_batch_edits.id", "asc")
    .execute();
}

/** Query two of two: target rows per edit, grouped, never one per edit. */
async function _readTargetCounts(options: {
  database: DatabaseExecutor;
  editIds: readonly string[];
}): Promise<Map<string, number>> {
  if (options.editIds.length === 0) {
    return new Map();
  }
  const rows = await options.database
    .selectFrom("upload_batch_edit_targets")
    .select((eb) => {
      return [
        "upload_batch_edit_targets.upload_batch_edit_id as editId",
        eb.fn.countAll<number>().as("targetCount"),
      ];
    })
    .where("upload_batch_edit_targets.upload_batch_edit_id", "in", [
      ...options.editIds,
    ])
    .groupBy("upload_batch_edit_targets.upload_batch_edit_id")
    .execute();
  return new Map(
    rows.map((row) => {
      return [row.editId, Number(row.targetCount)];
    }),
  );
}

/** The milestone a kind `milestone` edit names, or null for the others. */
function _makeMilestoneFromEditRow(
  row: Readonly<EditRow>,
): MilestoneRef | null {
  return row.milestoneId === null ||
    row.milestoneName === null ||
    row.milestoneStartsOn === null ||
    row.milestoneEndsOn === null
    ? null
    : {
        milestoneId: row.milestoneId,
        name: row.milestoneName,
        startsOn: row.milestoneStartsOn,
        endsOn: row.milestoneEndsOn,
        blurb: row.milestoneBlurb,
      };
}

/**
 * One row as the DTO. `label` reads the resolved row when there is one and
 * `label_snapshot` otherwise, so "What you have added" reads the same
 * before and after ingest resolves a new tag.
 */
function _makeEditDtoFromRow(options: {
  row: Readonly<EditRow>;
  targetCount: number;
  isPlanOpen: boolean;
}): UploadBatchEditDto {
  const { row } = options;
  const tag =
    row.tagId === null || row.tagName === null
      ? null
      : { tagId: row.tagId, name: row.tagName };
  const person =
    row.personId === null || row.personName === null
      ? null
      : { personId: row.personId, displayName: row.personName };
  const milestone = _makeMilestoneFromEditRow(row);
  return {
    editId: row.editId,
    kind: getUploadEditKindFromStoredValue(row.kind),
    label:
      tag?.name ??
      person?.displayName ??
      milestone?.name ??
      row.labelSnapshot ??
      "",
    tag,
    person,
    milestone,
    targetCount: options.targetCount,
    createdAt: row.createdAt,
    undoneAt: row.undoneAt,
    appliedAt: row.appliedAt,
    // The plan freezes at commit, so nothing can be undone after it.
    canUndo:
      options.isPlanOpen && row.undoneAt === null && row.appliedAt === null,
  };
}

/** The rows, their counts, and the DTOs, for either reader below. */
async function _readEditDtos(options: {
  database: DatabaseExecutor;
  sessionId: string;
  editId?: string;
  isPlanOpen: boolean;
}): Promise<UploadBatchEditDto[]> {
  const rows = await _readEditRows(options);
  const targetCounts = await _readTargetCounts({
    database: options.database,
    editIds: rows.map((row) => {
      return row.editId;
    }),
  });
  return rows.map((row) => {
    return _makeEditDtoFromRow({
      row,
      targetCount: targetCounts.get(row.editId) ?? 0,
      isPlanOpen: options.isPlanOpen,
    });
  });
}

/**
 * `UploadSessionDetail.edits`: the plan, oldest first, without the undone.
 *
 * Two queries (the edits, then the target counts grouped by edit id), never
 * one per edit (`upload.md` § Performance).
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.isPlanOpen `committed_at IS NULL`: the plan still moves.
 */
export async function readUploadBatchEdits(options: {
  database: DatabaseExecutor;
  sessionId: string;
  isPlanOpen: boolean;
}): Promise<UploadBatchEditDto[]> {
  return _readEditDtos(options);
}

/**
 * One edit of this session, undone or not, or nothing.
 *
 * What `POST .../edits` and `DELETE .../edits/:editId` answer with, composed
 * by the same function as the list so the two cannot drift.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session the edit must belong to.
 * @param options.editId The edit.
 * @param options.isPlanOpen `committed_at IS NULL`.
 */
export async function readUploadBatchEditById(options: {
  database: DatabaseExecutor;
  sessionId: string;
  editId: string;
  isPlanOpen: boolean;
}): Promise<UploadBatchEditDto | undefined> {
  const [edit] = await _readEditDtos(options);
  return edit;
}
