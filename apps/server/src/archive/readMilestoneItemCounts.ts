import { expressionBuilder } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

/**
 * Query 10 of a timeline page: what each banded occasion holds, per viewer.
 *
 * `GROUP BY milestone_id` over `item_milestones` joined to visible items, for
 * the milestones **taking a band** only. Strips print no count, so they cost
 * nothing.
 *
 * **The visibility predicate, not the page's selection.** The band prints the
 * whole occasion's total ("212 items"), which is a fact about the occasion
 * rather than about the current filter: under a tag filter the band still says
 * what the occasion holds. A milestone's item set is the join table and never
 * a date range, so an item attached from outside the span counts here too.
 *
 * @see {@link countSelectedItems}, the other count that looks like this one:
 *   it filters by the whole selection, not the visibility predicate alone.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.milestoneIds The occasions taking a band on this page.
 */
export async function readMilestoneItemCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  milestoneIds: readonly string[];
}): Promise<Map<string, number>> {
  if (options.milestoneIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_milestones")
    .innerJoin("items", "items.id", "item_milestones.item_id")
    .select((eb) => {
      return [
        "item_milestones.milestone_id as milestoneId",
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where("item_milestones.milestone_id", "in", [...options.milestoneIds])
    .where(
      visibilityExpression({
        eb: expressionBuilder<Database, "items">(),
        viewer: options.viewer,
      }),
    )
    .groupBy("item_milestones.milestone_id")
    .execute();

  return new Map(
    rows.map((row) => {
      return [row.milestoneId, Number(row.itemCount)];
    }),
  );
}
