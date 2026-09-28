import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";

/**
 * Every visibility rule this member may see through, as one query.
 *
 * The evaluation is `data-models.md` § The evaluation: `everyone` is visible
 * to all, `only` when the member is among the expanded subjects, `except` when
 * they are not. The member's own uploads are **not** here, because clause 2 of
 * that evaluation is a column on the item rather than a rule
 * (`applyVisibilityFilter.ts` adds it).
 *
 * One query rather than one per rule, over
 * `group_members (member_id, group_id)`, which `data-models.md` calls the
 * second-hottest index in the product. Group membership stays retroactive
 * because this runs at read time and nothing is ever snapshotted.
 *
 * `item_people` does not appear and must never be added: being in a photograph
 * is not a key to it (Decision 7).
 *
 * @param options.database A Kysely handle or a transaction.
 * @param options.memberId The viewer.
 * @returns The rule ids, in no particular order. Tens of rows.
 */
export async function getVisibleRuleIdsFromMemberId(options: {
  database: Kysely<Database>;
  memberId: string;
}): Promise<string[]> {
  const rows = await options.database
    .selectFrom("visibility_rules as rule")
    .select("rule.id")
    .where((eb) => {
      const namesMe = eb.exists(
        eb
          .selectFrom("visibility_rule_subjects as subject")
          .select("subject.id")
          .whereRef("subject.rule_id", "=", "rule.id")
          .where((subjectEb) => {
            return subjectEb.or([
              subjectEb("subject.member_id", "=", options.memberId),
              subjectEb(
                "subject.group_id",
                "in",
                subjectEb
                  .selectFrom("group_members")
                  .select("group_members.group_id")
                  .where("group_members.member_id", "=", options.memberId),
              ),
            ]);
          }),
      );

      return eb.or([
        eb("rule.mode", "=", "everyone"),
        eb.and([eb("rule.mode", "=", "only"), namesMe]),
        eb.and([eb("rule.mode", "=", "except"), eb.not(namesMe)]),
      ]);
    })
    .execute();

  return rows.map((row) => {
    return row.id;
  });
}
