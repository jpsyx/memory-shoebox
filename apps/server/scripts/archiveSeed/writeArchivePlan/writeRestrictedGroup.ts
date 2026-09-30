// apps/server/scripts/archiveSeed/writeArchivePlan/writeRestrictedGroup.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import {
  insertGroup,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../../test/helpers/seedHelpers/visibilitySeedHelpers.ts";
import { RESTRICTED_GROUP_NAME } from "../archivePlan.ts";

/**
 * Writes the one group restricted items are shared with, and the visibility
 * rule that names it as the only subject who may see a restricted item.
 *
 * @returns The rule's id, which a restricted item's `visibility_rule_id`
 *   points at. The group itself needs no further reference here: the viewer
 *   this seed writes is deliberately never added to it.
 */
export async function writeRestrictedGroup(
  database: Kysely<Database>,
): Promise<{ restrictedRuleId: string }> {
  const groupId = await insertGroup(database, { name: RESTRICTED_GROUP_NAME });
  const restrictedRuleId = await insertVisibilityRule(database, {
    mode: "only",
  });
  await insertVisibilityRuleSubject(database, {
    ruleId: restrictedRuleId,
    groupId,
  });
  return { restrictedRuleId };
}
