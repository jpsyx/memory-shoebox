import { sql } from "kysely";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Records one open at full size.
 *
 * **Not throttled**, and that is deliberate, unlike the session slide and
 * `members.last_seen_at`. The table is bounded by content rather than by
 * behaviour, one row per `(member, item)` forever, so the write never grows
 * the database; and `open_count` is the figure surface 17 prints as "items
 * opened", which would stop meaning anything if a timer decided which opens
 * counted.
 *
 * `first_opened_at` is `COALESCE`d rather than overwritten, because the row
 * may already exist from the seen latch: a sighting in a burst strip or in
 * the pile writes `first_seen_at` and nothing else.
 *
 * A 404 writes nothing, which is the caller's responsibility: this runs only
 * after the item has come back from the predicate.
 *
 * @param options.database The Kysely handle.
 * @param options.memberId The viewer.
 * @param options.itemId The item they opened.
 * @param options.now The instant recorded.
 */
export async function latchItemOpened(options: {
  database: DatabaseExecutor;
  memberId: string;
  itemId: string;
  now: string;
}): Promise<void> {
  await options.database
    .insertInto("item_views")
    .values({
      id: createId(),
      member_id: options.memberId,
      item_id: options.itemId,
      first_seen_at: options.now,
      first_opened_at: options.now,
      last_opened_at: options.now,
      open_count: 1,
    })
    .onConflict((conflict) => {
      return conflict.columns(["member_id", "item_id"]).doUpdateSet({
        first_opened_at: sql<string>`COALESCE(item_views.first_opened_at, ${options.now})`,
        last_opened_at: options.now,
        open_count: sql<number>`item_views.open_count + 1`,
      });
    })
    .execute();
}
