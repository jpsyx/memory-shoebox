import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Query 4 of a timeline page: `cover_item_id` for the bursts on it.
 *
 * Tens of rows at most. **This is the only column of `bursts` the read path
 * consults**: what a stack draws, how many frames it stands for and what span
 * it covers all come from the visible frames, because a stored count or a
 * stored span is the unfiltered one and would leak the restricted frames
 * through a denominator or through an endpoint.
 *
 * A burst whose cover is null, or whose cover this viewer cannot see, is
 * absent from the map, and the collapse falls back to the earliest visible
 * frame.
 *
 * @param options.database The Kysely handle.
 * @param options.burstIds The bursts drawn on this page.
 */
export async function readBurstCovers(options: {
  database: DatabaseExecutor;
  burstIds: readonly string[];
}): Promise<Map<string, string>> {
  if (options.burstIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("bursts")
    .select(["bursts.id as burstId", "bursts.cover_item_id as coverItemId"])
    .where("bursts.id", "in", [...options.burstIds])
    .where("bursts.cover_item_id", "is not", null)
    .execute();

  return new Map(
    rows.flatMap((row) => {
      return row.coverItemId === null ? [] : [[row.burstId, row.coverItemId]];
    }),
  );
}
