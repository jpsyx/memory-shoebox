import type { ItemsTable } from "../db/types/catalog.types.ts";
import { CAPTURE_SOURCES } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { VisibleItem } from "../items/getVisibleItemOr404.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

type ReconciliationItemOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  milestoneId: string;
  itemIds: readonly string[];
};

/** Reads the complete selection, validating visibility before membership. */
export async function readReconciliationItems(
  options: Readonly<ReconciliationItemOptions>,
): Promise<Map<string, VisibleItem>> {
  const rows = await applyVisibilityFilter({
    viewer: options.viewer,
    query: options.transaction
      .selectFrom("items")
      .where("items.id", "in", options.itemIds),
  })
    .leftJoin("item_milestones", (join) => {
      return join
        .onRef("item_milestones.item_id", "=", "items.id")
        .on("item_milestones.milestone_id", "=", options.milestoneId);
    })
    .selectAll("items")
    .select("item_milestones.id as attachmentId")
    .execute();
  if (rows.length !== options.itemIds.length) {
    throw ApiError.notFound("item_not_found");
  }
  if (
    rows.some((row) => {
      return row.attachmentId === null;
    })
  ) {
    throw ApiError.conflict({ code: "milestone_attachment_missing" });
  }
  return new Map(
    rows.map((row) => {
      const item = _makeVisibleItemFromRow(row);
      return [row.id, item];
    }),
  );
}

function _makeVisibleItemFromRow(row: Readonly<ItemsTable>): VisibleItem {
  return {
    itemId: row.id,
    kind: row.kind === "video" ? "video" : "photo",
    capturedAt: row.captured_at,
    capturedOn: row.captured_on,
    capturedAtOffsetMinutes: row.captured_at_offset_minutes,
    captureSource:
      CAPTURE_SOURCES.find((source) => {
        return source === row.capture_source;
      }) ?? "upload_time",
    originalCapturedAt: row.original_captured_at,
    uploadedBy: row.uploaded_by,
    visibilityRuleId: row.visibility_rule_id,
    burstId: row.burst_id,
    burstIndex: row.burst_index,
    durationMs: row.duration_ms,
    altTextOverride: row.alt_text,
    originalFilename: row.original_filename,
  };
}
