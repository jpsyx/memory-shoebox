// apps/server/scripts/archiveSeed/writeArchivePlan/clearRestrictedVisibility.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../../src/visibility/everyoneRule.ts";

/**
 * Deletes the restricted group and visibility rule a previous run of this
 * seed made, so writing twice does not collide with the group's unique name.
 *
 * The fixed `everyone` rule migration 0002 seeds is left standing: this seed
 * never owns it, and the whole catalog would lose its default visibility if
 * it went. Deleting a rule cascades to its own subject rows, which is what
 * lets the group beneath it be deleted afterwards without hitting the
 * restrict on `visibility_rule_subjects.group_id`.
 *
 * Must run after `clearOwnedTables`: `items.visibility_rule_id` restricts
 * deleting a rule an item still points at, so `items` has to be empty first.
 */
export async function clearRestrictedVisibility(
  database: Kysely<Database>,
): Promise<void> {
  await database
    .deleteFrom("visibility_rules")
    .where("id", "!=", EVERYONE_VISIBILITY_RULE_ID)
    .execute();
  await database.deleteFrom("groups").execute();
}
