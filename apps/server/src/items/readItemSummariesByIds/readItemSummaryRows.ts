import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";

/** One requested item, visibility-filtered, with its own seen state. */
export type ItemSummaryRow = {
  itemId: string;
  width: number;
  height: number;
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
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.itemIds The selection the caller asked for.
 */
export async function readItemSummaryRows(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    itemIds: readonly string[];
  }>,
): Promise<ItemSummaryRow[]> {
  // Apply visibility before widening the query with item_views. Keep the
  // member condition in ON so items with no view row survive the left join.
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.kind as kind",
        "items.width as width",
        "items.height as height",
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
