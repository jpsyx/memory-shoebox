import type { MilestoneDetail, MilestoneSummary } from "@memory-shoebox/shared";
import { getDayCountFromMilestone } from "../archive/milestoneSpanHelpers.ts";
import { readMilestoneItemCounts } from "../archive/readMilestoneItemCounts.ts";
import type { MilestonesTable } from "../db/types/catalog.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

/** Composes the frozen milestone reference with viewer counts and capabilities. */
export function makeMilestoneSummaryFromMilestoneRow(options: {
  row: MilestonesTable;
  viewer: Viewer;
  itemCount: number;
}): MilestoneSummary {
  const { row, viewer, itemCount } = options;
  const milestone = {
    milestoneId: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    blurb: row.blurb,
  };
  return {
    milestone,
    itemCount,
    dayCount: getDayCountFromMilestone(milestone),
    canEdit: viewer.role !== "viewer",
    canDelete: viewer.role !== "viewer",
  };
}

type DetailOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  milestoneId: string;
};

type MilestoneCreatorRow = MilestonesTable & {
  creatorId: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
};

async function _readMilestoneCreatorRow(
  options: DetailOptions,
): Promise<MilestoneCreatorRow> {
  const row = await options.database
    .selectFrom("milestones")
    .leftJoin("members", "members.id", "milestones.created_by")
    .selectAll("milestones")
    .select([
      "members.id as creatorId",
      "members.display_name as creatorName",
      "members.email as creatorEmail",
    ])
    .where("milestones.id", "=", options.milestoneId)
    .executeTakeFirst();
  if (row === undefined) {
    throw ApiError.notFound("milestone_not_found");
  }
  return row;
}

async function _readMismatchCount(
  options: DetailOptions & { row: MilestonesTable },
): Promise<number> {
  const { database, viewer, milestoneId, row } = options;
  const mismatch = await applyVisibilityFilter({
    query: database
      .selectFrom("item_milestones")
      .innerJoin("items", "items.id", "item_milestones.item_id")
      .select((eb) => {
        return eb.fn.countAll<number>().as("count");
      })
      .where("item_milestones.milestone_id", "=", milestoneId)
      .where("item_milestones.span_mismatch_acknowledged_at", "is", null)
      .where((eb) => {
        return eb.or([
          eb("items.captured_on", "<", row.starts_on),
          eb("items.captured_on", ">", row.ends_on),
        ]);
      }),
    viewer,
  }).executeTakeFirstOrThrow();
  return Number(mismatch.count);
}

/** Reads detail in three fixed queries, regardless of attachment count. */
export async function readMilestoneDetail(
  options: DetailOptions,
): Promise<MilestoneDetail> {
  const { database, viewer, milestoneId } = options;
  const row = await _readMilestoneCreatorRow(options);
  const counts = await readMilestoneItemCounts({
    database,
    viewer,
    milestoneIds: [milestoneId],
  });
  const mismatchCount = await _readMismatchCount({ ...options, row });
  return {
    ...makeMilestoneSummaryFromMilestoneRow({
      row,
      viewer,
      itemCount: counts.get(milestoneId) ?? 0,
    }),
    mismatchCount,
    createdBy:
      row.creatorId === null || row.creatorEmail === null
        ? null
        : {
            memberId: row.creatorId,
            displayName: getDisplayNameFromMember({
              storedDisplayName: row.creatorName ?? undefined,
              email: row.creatorEmail,
            }),
          },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
