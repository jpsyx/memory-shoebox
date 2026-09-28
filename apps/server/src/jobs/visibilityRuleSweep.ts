import { sql, type Kysely, type SqlBool } from "kysely";
import type { Database } from "../db/types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../visibility/everyoneRule.ts";

/** What one run removed. */
export type VisibilityRuleSweepSummary = {
  deletedCount: number;
};

/**
 * Deletes `visibility_rules` rows nothing references.
 *
 * `POST /api/visibility-rules/resolve` mints a rule for an upload that may
 * then be abandoned, so orphans accumulate and nothing else clears them
 * (`conventions.md` § The job runner). `visibility_rule_subjects` cascades, so
 * deleting the rule takes its subjects with it.
 *
 * Two exclusions, and both are load-bearing. `items.visibility_rule_id` and
 * `upload_sessions.visibility_rule_id` are both `ON DELETE RESTRICT`, so a
 * sweep that ignored either would not quietly corrupt anything: it would throw,
 * every five minutes, forever. And the seeded `everyone` rule is never deleted
 * even when no item references it, because a fresh Shoebox references it with
 * nothing and the first upload expects it to be there.
 */
export async function runVisibilityRuleSweep(options: {
  database: Kysely<Database>;
}): Promise<VisibilityRuleSweepSummary> {
  const result = await options.database
    .deleteFrom("visibility_rules")
    .where("id", "!=", EVERYONE_VISIBILITY_RULE_ID)
    .where(
      sql<SqlBool>`NOT EXISTS (
        SELECT 1 FROM items
        WHERE items.visibility_rule_id = visibility_rules.id
      )`,
    )
    .where(
      sql<SqlBool>`NOT EXISTS (
        SELECT 1 FROM upload_sessions
        WHERE upload_sessions.visibility_rule_id = visibility_rules.id
      )`,
    )
    .executeTakeFirst();

  return { deletedCount: Number(result.numDeletedRows) };
}
