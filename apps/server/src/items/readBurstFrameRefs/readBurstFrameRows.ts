import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";
import { sortsAfterFrame, type FrameSortKey } from "./frameSortKey.ts";

/** One visible sibling, before it is signed and numbered. */
export type BurstFrameRow = {
  itemId: string;
  /** `items.burst_index`, which with `itemId` is the strip's sort key. */
  burstIndex: number | null;
  capturedAt: string;
  altTextOverride: string | null;
  /** No `item_views` row for this viewer, which is what the dot draws. */
  isUnseen: boolean;
};

/**
 * Every sibling of one burst this viewer may see, oldest first.
 *
 * Ordered `(burst_index ASC, id ASC)`. `burst_index` is 1-based and nullable,
 * and a null sorts last, ahead of nothing: SQLite's own default puts a null
 * first on an ascending sort, so the direction carries an explicit
 * `nulls last` rather than relying on that default.
 *
 * The anti-join to `item_views` rides along rather than costing a query of its
 * own, because `BurstSummary.hasUnseenFrames` is a fact about the same rows.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.burstId The burst.
 * @param options.limit How many rows to take.
 * @param options.after Resume strictly after this frame, in that same order.
 */
export async function readBurstFrameRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  burstId: string;
  limit: number;
  after?: FrameSortKey;
}): Promise<BurstFrameRow[]> {
  // The predicate is applied before the join, not after: a left join rewrites
  // the joined table's columns to nullable inside the query's own schema, and
  // `applyVisibilityFilter` is generic over the unaltered `Database`. Both
  // orders compile to the same statement, because a builder's call order is
  // not the clause order.
  const siblings = options.database
    .selectFrom("items")
    .select([
      "items.id as itemId",
      "items.burst_index as burstIndex",
      "items.captured_at as capturedAt",
      "items.alt_text as altTextOverride",
    ])
    .where("items.burst_id", "=", options.burstId);

  const visibleFrames = applyVisibilityFilter({
    viewer: options.viewer,
    // The resume predicate is not a plain `id >`: the order is
    // `(burst_index, id)` and the two need not agree.
    query:
      options.after === undefined
        ? siblings
        : siblings.where(sortsAfterFrame(options.after)),
  });

  const rows = await visibleFrames
    // The member predicate belongs in the `ON` and never in the `WHERE`, or
    // the anti-join turns inner and every seen frame disappears.
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select("item_views.item_id as seenItemId")
    .orderBy("items.burst_index", (orderBy) => {
      return orderBy.asc().nullsLast();
    })
    .orderBy("items.id", "asc")
    .limit(options.limit)
    .execute();

  return rows.map((row) => {
    return {
      itemId: row.itemId,
      burstIndex: row.burstIndex,
      capturedAt: row.capturedAt,
      altTextOverride: row.altTextOverride,
      isUnseen: row.seenItemId === null,
    };
  });
}
