import type { VisibilitySummary } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

/** One subject of one rule, as the interface draws it. */
export type RuleSubject = {
  kind: "member" | "group";
  id: string;
  displayName: string;
};

/** One joined row, before it is turned into a subject or dropped. */
type VisibilityRuleRow = {
  ruleId: string;
  mode: string;
  memberId: string | null;
  memberDisplayName: string | null;
  memberEmail: string | null;
  groupId: string | null;
  groupName: string | null;
};

/** The column is `CHECK IN ('everyone','only','except')`. */
function _getModeFromStoredValue(value: string): VisibilitySummary["mode"] {
  if (value === "only") {
    return "only";
  }
  return value === "except" ? "except" : "everyone";
}

/**
 * The words on the lock chip, or nothing.
 *
 * A rule whose whole subject set is **one group** is that group's name: "Just
 * us two" is a group in the fixtures, and it reads better than the list the
 * client would otherwise assemble. Everything else is null, and `apps/web`'s
 * `visibilityLabel` assembles "Only Papá, Mamá" from the subjects.
 *
 * `except` gets null too, and that is the point of the mode check rather than
 * an oversight: a bare "Just us two" on a rule meaning everyone **except**
 * those two says the opposite of what it means. The client prints "Everyone
 * except Cousins" instead, which is correct and is already built.
 *
 * The one genuinely pure decision in this module: no database, no async, just
 * a mode and a subject list in, a label or null out. Exported so it can be
 * tested directly rather than only through {@link readVisibilitySummaries}.
 */
export function makeLabelFromSubjects(options: {
  mode: VisibilitySummary["mode"];
  subjects: readonly RuleSubject[];
}): string | null {
  const [only] = options.subjects;
  return options.mode === "only" &&
    options.subjects.length === 1 &&
    only?.kind === "group"
    ? only.displayName
    : null;
}

/** One joined row as a subject, or nothing when the rule has none. */
function _makeSubjectFromRow(row: VisibilityRuleRow): RuleSubject | undefined {
  if (row.memberId !== null && row.memberEmail !== null) {
    return {
      kind: "member",
      id: row.memberId,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.memberDisplayName ?? undefined,
        email: row.memberEmail,
      }),
    };
  }
  if (row.groupId !== null && row.groupName !== null) {
    return { kind: "group", id: row.groupId, displayName: row.groupName };
  }
  return undefined;
}

/**
 * Turns the joined rows for a batch of rules into one summary per rule.
 *
 * Three passes over the same rows: the mode each rule stores, the subjects
 * each rule carries (a left join fans out one row per subject, so a rule
 * with no subjects still needs an entry with an empty list), and finally the
 * pairing of the two, plus the label, into the summary the route serves.
 */
function _makeVisibilitySummariesFromRows(
  rows: readonly VisibilityRuleRow[],
): Map<string, VisibilitySummary> {
  const modesByRuleId = new Map(
    rows.map((row) => {
      return [row.ruleId, _getModeFromStoredValue(row.mode)];
    }),
  );

  const subjectsByRuleId = rows.reduce<Map<string, RuleSubject[]>>(
    (subjects, row) => {
      const existing = subjects.get(row.ruleId) ?? [];
      const subject = _makeSubjectFromRow(row);
      if (subject !== undefined) {
        existing.push(subject);
      }
      subjects.set(row.ruleId, existing);
      return subjects;
    },
    new Map(),
  );

  return new Map(
    [...modesByRuleId.entries()].map(([ruleId, mode]) => {
      const subjects = subjectsByRuleId.get(ruleId) ?? [];
      return [
        ruleId,
        { mode, label: makeLabelFromSubjects({ mode, subjects }), subjects },
      ];
    }),
  );
}

/**
 * Query 6 of a timeline page: who may see each rule on it.
 *
 * Keyed by the distinct `visibility_rule_id` values the page carries, which is
 * a handful even on a 212-item day: rules are massively shared, because one
 * upload is one decision covering 264 files.
 *
 * The label is composed here and never stored. The rule is shared and deduped,
 * so a stored label would go stale the moment a group was renamed, and it
 * would go stale on 264 photographs at once.
 *
 * @param options.database The Kysely handle.
 * @param options.ruleIds The distinct rules on the page.
 */
export async function readVisibilitySummaries(options: {
  database: DatabaseExecutor;
  ruleIds: readonly string[];
}): Promise<Map<string, VisibilitySummary>> {
  if (options.ruleIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("visibility_rules")
    .leftJoin(
      "visibility_rule_subjects",
      "visibility_rule_subjects.rule_id",
      "visibility_rules.id",
    )
    .leftJoin("members", "members.id", "visibility_rule_subjects.member_id")
    .leftJoin("groups", "groups.id", "visibility_rule_subjects.group_id")
    .select([
      "visibility_rules.id as ruleId",
      "visibility_rules.mode as mode",
      "members.id as memberId",
      "members.display_name as memberDisplayName",
      "members.email as memberEmail",
      "groups.id as groupId",
      "groups.name as groupName",
    ])
    .where("visibility_rules.id", "in", [...options.ruleIds])
    .execute();

  return _makeVisibilitySummariesFromRows(rows);
}
