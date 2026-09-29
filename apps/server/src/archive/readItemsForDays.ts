import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";

/** One visible item, as the day stream reads it before it becomes a DTO. */
export type ItemRow = {
  itemId: string;
  kind: "photo" | "video";
  capturedAt: string;
  capturedOn: string;
  durationMs: number | null;
  /** `items.alt_text`: an override, written only when somebody typed one. */
  altTextOverride: string | null;
  visibilityRuleId: string;
  uploadedBy: string;
  burstId: string | null;
  isUnseen: boolean;
};

/** The column is `CHECK IN ('photo','video')`, so this cannot see a third. */
function _getKindFromStoredValue(value: string): "photo" | "video" {
  return value === "video" ? "video" : "photo";
}

/**
 * Query 3 of a timeline page: every visible item on the chosen days.
 *
 * `captured_on IN (:days)` plus the selection, so burst grouping and the cover
 * choice happen in process with no further query. Frames are ordinary items
 * and arrive already visibility-filtered, which is what makes a burst with no
 * visible frames vanish with no code at all.
 *
 * **Ordered oldest first within the day**, so a day reads the way it happened,
 * with `seq` as the tiebreak because two frames of a burst can share a
 * millisecond. The order the server sends is the order the wall is built from:
 * the messy pile seeds its tilt, offset and z-order from the item's index
 * (`DESIGN.md` § Do's), so a client that re-sorted would reshuffle it.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 * @param options.days The days this page returns.
 */
export async function readItemsForDays(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  days: readonly string[];
}): Promise<ItemRow[]> {
  if (options.days.length === 0) {
    return [];
  }

  const rows = await options.database
    .selectFrom("items")
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select([
      "items.id as itemId",
      "items.kind as kind",
      "items.captured_at as capturedAt",
      "items.captured_on as capturedOn",
      "items.duration_ms as durationMs",
      "items.alt_text as altTextOverride",
      "items.visibility_rule_id as visibilityRuleId",
      "items.uploaded_by as uploadedBy",
      "items.burst_id as burstId",
      "item_views.item_id as seenItemId",
    ])
    .where("items.captured_on", "in", [...options.days])
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .orderBy("items.captured_at", "asc")
    .orderBy("items.seq", "asc")
    .execute();

  return rows.map((row) => {
    return {
      itemId: row.itemId,
      kind: _getKindFromStoredValue(row.kind),
      capturedAt: row.capturedAt,
      capturedOn: row.capturedOn,
      durationMs: row.durationMs,
      altTextOverride: row.altTextOverride,
      visibilityRuleId: row.visibilityRuleId,
      uploadedBy: row.uploadedBy,
      burstId: row.burstId,
      isUnseen: row.seenItemId === null,
    };
  });
}
