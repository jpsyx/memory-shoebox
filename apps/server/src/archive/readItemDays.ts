import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilterHelpers.ts";

/** One day of the stream, before anything is known about what is on it. */
export type CandidateDay = {
  capturedOn: string;
  /** Every visible item on the day, burst frames counted individually. */
  itemCount: number;
  /** Visible photos, including every visible burst frame. */
  photoCount: number;
  /** Visible videos on the day. */
  videoCount: number;
  /** Visible items this viewer has no `item_views` row for. */
  unseenCount: number;
};

type Options = {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  beforeDay?: string;
  afterDay?: string;
  direction?: "older" | "newer";
  limit?: number;
};

/** One grouped row as a `CandidateDay`, coercing SQLite's raw count values. */
function _makeCandidateDayFromRow(row: Readonly<CandidateDay>): CandidateDay {
  return {
    capturedOn: row.capturedOn,
    itemCount: Number(row.itemCount),
    photoCount: Number(row.photoCount),
    videoCount: Number(row.videoCount),
    unseenCount: Number(row.unseenCount),
  };
}

/**
 * Query 1 of a timeline page: the days with per-viewer media and unseen counts.
 *
 * Uses exclusive date keysets and a grouped day limit in either direction.
 * Admin reads group in date-index order; the non-admin visibility-or-uploader
 * plan can group the eligible range in a temporary tree (see docs/archive.md).
 * Media counts also read each item's kind.
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
 * @param options.afterDay Exclusive lower bound for a newer page.
 * @param options.direction Nearest eligible days first; descending for the rail.
 * @param options.limit Days to read. Omitted for the rail, which is complete.
 */
export async function readItemDays(
  options: Readonly<Options>,
): Promise<CandidateDay[]> {
  const grouped = options.database
    .selectFrom("items")
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select((expressionBuilder) => {
      const itemCount = expressionBuilder.fn.countAll<number>();
      return [
        "items.captured_on as capturedOn",
        itemCount.as("itemCount"),
        itemCount.filterWhere("items.kind", "=", "photo").as("photoCount"),
        itemCount.filterWhere("items.kind", "=", "video").as("videoCount"),
        itemCount
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
    .orderBy(
      "items.captured_on",
      options.direction === "newer" ? "asc" : "desc",
    );
  const bounded =
    options.beforeDay === undefined
      ? grouped
      : grouped.where("items.captured_on", "<", options.beforeDay);
  const afterBounded =
    options.afterDay === undefined
      ? bounded
      : bounded.where("items.captured_on", ">", options.afterDay);
  const limited =
    options.limit === undefined
      ? afterBounded
      : afterBounded.limit(options.limit);
  return (await limited.execute()).map(_makeCandidateDayFromRow);
}
