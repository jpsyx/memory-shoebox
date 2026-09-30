import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";

/** One requested item, visibility-filtered, with its own seen state. */
export type ItemSummaryRow = {
  itemId: string;
  kind: string;
  capturedAt: string;
  capturedOn: string;
  durationMs: number | null;
  altTextOverride: string | null;
  uploadedBy: string;
  visibilityRuleId: string;
  burstId: string | null;
  seenItemId: string | null;
};

/**
 * The requested items, visibility-filtered, with each one's seen state.
 *
 * Filtered before the join, not after: `applyVisibilityFilter`'s generic
 * signature is over `SelectQueryBuilder<Database, TB | "items", Output>`,
 * and joining `item_views` into the query passed in front of it collides
 * two structurally distinct instantiations of the same generic table set.
 * Applying the filter first and joining the builder it hands back avoids
 * that, and is the same order `readBurstFrameRows.ts` already uses. The
 * member predicate belongs in the `ON`: in the `WHERE` it would turn the
 * anti-join inner and every seen item would disappear.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.itemIds The selection the caller asked for.
 */
export async function readItemSummaryRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemIds: readonly string[];
}): Promise<ItemSummaryRow[]> {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.kind as kind",
        "items.captured_at as capturedAt",
        "items.captured_on as capturedOn",
        "items.duration_ms as durationMs",
        "items.alt_text as altTextOverride",
        "items.uploaded_by as uploadedBy",
        "items.visibility_rule_id as visibilityRuleId",
        "items.burst_id as burstId",
      ])
      .where("items.id", "in", [...options.itemIds]),
  })
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select("item_views.item_id as seenItemId")
    .execute();
}
