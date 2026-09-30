import type { VisibilitySummary } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import {
  makeLabelFromSubjects,
  type RuleSubject,
} from "./makeLabelFromSubjects.ts";

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
  return value === "only" ? "only" : value === "except" ? "except" : "everyone";
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
        {
          visibilityRuleId: ruleId,
          mode,
          label: makeLabelFromSubjects({ mode, subjects }),
          subjects,
        },
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
