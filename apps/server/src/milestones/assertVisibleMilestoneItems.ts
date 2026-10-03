import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

/** Validates the whole selection before writes, without identifying hidden IDs. */
export async function assertVisibleMilestoneItems(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemIds: readonly string[];
}): Promise<void> {
  if (options.itemIds.length === 0) {
    return;
  }
  const itemIds = [...new Set(options.itemIds)];
  const rows = await applyVisibilityFilter({
    query: options.database
      .selectFrom("items")
      .select("items.id")
      .where("items.id", "in", itemIds),
    viewer: options.viewer,
  }).execute();
  if (rows.length !== itemIds.length) {
    throw ApiError.notFound("item_not_found");
  }
}
