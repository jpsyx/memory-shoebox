// apps/server/scripts/archiveSeed/writeArchivePlan/clearOwnedTables.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";

/**
 * Every table the seed owns, cleared before it writes, in deletion order.
 *
 * `upload_sessions` is last and has to be: `bursts.upload_session_id`
 * restricts deleting a session a burst still points at, and while
 * `items.upload_session_id` only sets null, an item left pointing at nothing
 * is not what a rerun should leave behind either. Both are gone by the time
 * the session is deleted.
 */
const OWNED_TABLES = [
  "item_views",
  "item_milestones",
  "item_people",
  "item_tags",
  "item_renditions",
  "items",
  "bursts",
  "milestones",
  "people",
  "tags",
  "upload_sessions",
] as const;

/** Deletes every row in a table this seed owns, so a rerun starts clean. */
export async function clearOwnedTables(
  database: Kysely<Database>,
): Promise<void> {
  // A loop because each delete is awaited before the next begins, which is
  // the one exception the TypeScript rules make: `OWNED_TABLES` is in
  // foreign-key deletion order, and a `map` over an async function would
  // start every delete at once and hit the restricts in between.
  for (const table of OWNED_TABLES) {
    await database.deleteFrom(table).execute();
  }
}
