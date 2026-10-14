import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
  type TimelineFilter,
} from "../../archive/selectionFilterHelpers.ts";
import { sortsAfterFrame, type FrameSortKey } from "./frameSortKey.ts";

/** One visible sibling, before it is signed and numbered. */
export type BurstFrameRow = {
  itemId: string;
  width: number;
  height: number;
  canRemoveFromBurst?: boolean;
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
 * @param options.filter Optional timeline filters, applied before pagination.
 */
export async function readBurstFrameRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  burstId: string;
  limit: number;
  after?: FrameSortKey;
  filter?: Readonly<TimelineFilter>;
}): Promise<BurstFrameRow[]> {
  const siblings = options.database
    .selectFrom("items")
    .select([
      "items.id as itemId",
      "items.width as width",
      "items.height as height",
      "items.uploaded_by as uploadedBy",
      "items.kind as kind",
      "items.burst_index as burstIndex",
      "items.captured_at as capturedAt",
      "items.alt_text as altTextOverride",
    ])
    .where("items.burst_id", "=", options.burstId)
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter ?? makeTimelineFilterFromQuery({}),
      }),
    );

  // Resume within the filtered set using the stored sort key, not plain id.
  const visibleFrames =
    options.after === undefined
      ? siblings
      : siblings.where(sortsAfterFrame(options.after));

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
      width: row.width,
      height: row.height,
      canRemoveFromBurst:
        row.kind === "photo" &&
        (options.viewer.isAdmin || options.viewer.memberId === row.uploadedBy),
      burstIndex: row.burstIndex,
      capturedAt: row.capturedAt,
      altTextOverride: row.altTextOverride,
      isUnseen: row.seenItemId === null,
    };
  });
}
