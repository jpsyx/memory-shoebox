import { readBurstCovers } from "../../archive/readBurstCovers.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";
import type { BurstFrameRow } from "../readBurstFrameRefs/readBurstFrameRows.ts";

/** One burst-sibling row, before it is grouped by the burst it belongs to. */
type BurstSiblingRow = {
  burstId: string | null;
  itemId: string;
  burstIndex: number | null;
  capturedAt: string;
  altTextOverride: string | null;
  seenItemId: string | null;
};

/** Every visible sibling of the given bursts, oldest first. */
async function _readBurstSiblingRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  burstIds: readonly string[];
}): Promise<BurstSiblingRow[]> {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.burst_id as burstId",
        "items.id as itemId",
        "items.burst_index as burstIndex",
        "items.captured_at as capturedAt",
        "items.alt_text as altTextOverride",
      ])
      .where("items.burst_id", "in", options.burstIds),
  })
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select("item_views.item_id as seenItemId")
    .orderBy("items.burst_index", "asc")
    .orderBy("items.id", "asc")
    .execute();
}

/** The sibling rows, keyed by the burst each one belongs to. */
function _groupSiblingsByBurstId(
  rows: readonly BurstSiblingRow[],
): Map<string, BurstFrameRow[]> {
  return rows.reduce<Map<string, BurstFrameRow[]>>((grouped, row) => {
    if (row.burstId === null) {
      return grouped;
    }
    const existing = grouped.get(row.burstId) ?? [];
    existing.push({
      itemId: row.itemId,
      burstIndex: row.burstIndex,
      capturedAt: row.capturedAt,
      altTextOverride: row.altTextOverride,
      isUnseen: row.seenItemId === null,
    });
    grouped.set(row.burstId, existing);
    return grouped;
  }, new Map());
}

/**
 * Every visible sibling of the bursts this selection touches, grouped.
 *
 * One `burst_id IN (...)` however many bursts, and uncapped, which is what
 * lets each burst's totals come straight off its rows rather than costing an
 * aggregate apiece.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.burstIds The bursts the selection touches.
 */
export async function readBurstSiblingsByBurstId(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  burstIds: readonly string[];
}): Promise<{
  siblingsByBurstId: Map<string, BurstFrameRow[]>;
  covers: Map<string, string>;
}> {
  if (options.burstIds.length === 0) {
    return { siblingsByBurstId: new Map(), covers: new Map() };
  }

  const [rows, covers] = await Promise.all([
    _readBurstSiblingRows(options),
    readBurstCovers({
      database: options.database,
      burstIds: options.burstIds,
    }),
  ]);

  return { siblingsByBurstId: _groupSiblingsByBurstId(rows), covers };
}
