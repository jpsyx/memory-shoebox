import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";

/** One day of the stream, before anything is known about what is on it. */
export type CandidateDay = {
  capturedOn: string;
  /** Every visible item on the day, burst frames counted individually. */
  itemCount: number;
  /** Visible items this viewer has no `item_views` row for. */
  unseenCount: number;
};

/**
 * Query 1 of a timeline page: the days, with their two per-viewer counts.
 *
 * Rides `(captured_on DESC, visibility_rule_id, id)`, so the group-by runs in
 * index order and a limit stops early without touching the table.
 *
 * **The `item_views` join is `ON v.item_id = i.id AND v.member_id = :me`, in
 * the `ON` clause.** In the `WHERE` it becomes an inner join and every item
 * the viewer has already seen disappears from the archive, which is silent in
 * any fixture where nothing has been seen yet.
 *
 * `unseenCount` is the same anti-join aggregated, so the spine's "31 new" and
 * the dots on the prints are the same fact counted once.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.beforeDay Exclusive upper bound: the cursor's day.
 * @param options.limit Days to read. Omitted for the rail, which is complete.
 */
export async function readItemDays(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  beforeDay?: string;
  limit?: number;
}): Promise<CandidateDay[]> {
  const grouped = options.database
    .selectFrom("items")
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select((eb) => {
      return [
        "items.captured_on as capturedOn",
        eb.fn.countAll<number>().as("itemCount"),
        eb.fn
          .countAll<number>()
          .filterWhere("item_views.item_id", "is", null)
          .as("unseenCount"),
      ];
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .groupBy("items.captured_on")
    .orderBy("items.captured_on", "desc");

  const bounded =
    options.beforeDay === undefined
      ? grouped
      : grouped.where("items.captured_on", "<", options.beforeDay);
  const limited =
    options.limit === undefined ? bounded : bounded.limit(options.limit);

  const rows = await limited.execute();
  return rows.map((row) => {
    return {
      capturedOn: row.capturedOn,
      itemCount: Number(row.itemCount),
      unseenCount: Number(row.unseenCount),
    };
  });
}
