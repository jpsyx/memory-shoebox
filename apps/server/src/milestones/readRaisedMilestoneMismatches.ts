import type { ReconcileMilestoneResponse } from "@memory-shoebox/shared";
import { sql } from "kysely";
import type { MilestonesTable } from "../db/types/catalog.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

type RaisedOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  milestoneId: string;
  changedItemIds: readonly string[];
};

function _makeAffectedMilestoneExpressionFromItemIds(
  itemIds: readonly string[],
) {
  return sql<boolean>`exists (
    select 1 from item_milestones as affected
    join items as moved on moved.id = affected.item_id
    where affected.milestone_id = milestones.id
      and affected.item_id in (${sql.join(itemIds)})
      and (moved.captured_on < milestones.starts_on or moved.captured_on > milestones.ends_on)
  )`;
}

function _makeVisibleMismatchQueryFromOptions(
  options: Readonly<RaisedOptions>,
) {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.transaction
      .selectFrom("milestones")
      .innerJoin(
        "item_milestones",
        "item_milestones.milestone_id",
        "milestones.id",
      )
      .innerJoin("items", "items.id", "item_milestones.item_id")
      .selectAll("milestones")
      .select((eb) => {
        return eb.fn.countAll<number>().as("mismatchCount");
      })
      .where("milestones.id", "!=", options.milestoneId)
      .where("item_milestones.span_mismatch_acknowledged_at", "is", null)
      .where((eb) => {
        return eb.or([
          eb("items.captured_on", "<", eb.ref("milestones.starts_on")),
          eb("items.captured_on", ">", eb.ref("milestones.ends_on")),
        ]);
      })
      .where(
        _makeAffectedMilestoneExpressionFromItemIds(options.changedItemIds),
      )
      .groupBy("milestones.id")
      .orderBy("milestones.starts_on", "desc")
      .orderBy("milestones.id", "desc"),
  });
}

function _makeRaisedMismatchFromRow(
  row: Readonly<MilestonesTable & { mismatchCount: number }>,
): ReconcileMilestoneResponse["raisedElsewhere"][number] {
  return {
    milestone: {
      milestoneId: row.id,
      name: row.name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      blurb: row.blurb,
    },
    mismatchCount: Number(row.mismatchCount),
  };
}

/** Reports affected other occasions with full visible unacknowledged counts. */
export async function readRaisedMilestoneMismatches(
  options: Readonly<RaisedOptions>,
): Promise<ReconcileMilestoneResponse["raisedElsewhere"]> {
  if (options.changedItemIds.length === 0) {
    return [];
  }
  const rows = await _makeVisibleMismatchQueryFromOptions(options).execute();
  return rows.map((row) => {
    return _makeRaisedMismatchFromRow(row);
  });
}
