import type { MilestoneRef, UploadBatchEditDto } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { getUploadEditKindFromStoredValue } from "../uploadStateHelpers.ts";

import type { EditRow } from "./readUploadBatchEditsHelpers.types.ts";

import { EDIT_ROW_COLUMNS } from "./readUploadBatchEditsHelpers.constants.ts";

/** Query one of two: the edits, with the rows they name joined on. */
export async function readEditRows(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
    editId?: string;
  }>,
): Promise<EditRow[]> {
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
export async function readTargetCounts(
  options: Readonly<{
    database: DatabaseExecutor;
    editIds: readonly string[];
  }>,
): Promise<Map<string, number>> {
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

/** The milestone a kind `milestone` edit names, or undefined for the others. */
function _makeMilestoneFromEditRow(
  row: Readonly<EditRow>,
): MilestoneRef | undefined {
  return row.milestoneId === null ||
    row.milestoneName === null ||
    row.milestoneStartsOn === null ||
    row.milestoneEndsOn === null
    ? undefined
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
export function makeEditDtoFromRow(
  options: Readonly<{
    row: Readonly<EditRow>;
    targetCount: number;
    isPlanOpen: boolean;
  }>,
): UploadBatchEditDto {
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
    milestone: milestone ?? null,
    targetCount: options.targetCount,
    createdAt: row.createdAt,
    undoneAt: row.undoneAt,
    appliedAt: row.appliedAt,
    // The plan freezes at commit, so nothing can be undone after it.
    canUndo:
      options.isPlanOpen && row.undoneAt === null && row.appliedAt === null,
  };
}
