import type { ExpressionBuilder, Expression, SqlBool } from "kysely";
import type { Database, DatabaseExecutor } from "../../db/types/db.types.ts";

import { getDisplayNameFromMember } from "../../members/getDisplayNameFromMember.ts";

import { getMemberRoleFromStoredValue } from "../../members/getMemberRoleFromStoredValue.ts";

import type {
  RuleDayCount,
  Candidate,
  RecipientFigures,
  Recipient,
  EnqueueUploadSessionEmailsOptions,
} from "./enqueueUploadSessionEmails.types.ts";

/**
 * Query 1 of `notifications.md` § Recipient resolution: the batch's rules
 * and their counts, grouped by day as well, because each recipient's
 * `capturedOn` and day count fall out of the same rows. |R| x days rows, and
 * |R| = 1 in the normal case.
 */
async function _readRuleDayCounts(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
}): Promise<RuleDayCount[]> {
  const rows = await options.transaction
    .selectFrom("items")
    .select((eb) => {
      return [
        "items.visibility_rule_id as ruleId",
        "items.captured_on as capturedOn",
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where("items.upload_session_id", "=", options.sessionId)
    .groupBy(["items.visibility_rule_id", "items.captured_on"])
    .execute();

  return rows.map((row) => {
    return { ...row, itemCount: Number(row.itemCount) };
  });
}

/**
 * Query 2: every active member who wants upload mail, minus the uploader.
 *
 * The actor is excluded by id here, before the intersection, and so is
 * anybody with `notify_on_upload = 0`. An invited member who has not signed
 * in yet is not `active`, and their invitation is already doing this job.
 */
async function _readCandidates(options: {
  transaction: DatabaseExecutor;
  uploadedBy: string;
}): Promise<Candidate[]> {
  const rows = await options.transaction
    .selectFrom("members")
    .select([
      "members.id as memberId",
      "members.email as email",
      "members.display_name as storedDisplayName",
      "members.role as role",
    ])
    .where("members.status", "=", "active")
    .where("members.notify_on_upload", "=", 1)
    .where("members.id", "!=", options.uploadedBy)
    .execute();

  return rows.map((row) => {
    return {
      memberId: row.memberId,
      email: row.email,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.storedDisplayName ?? undefined,
        email: row.email,
      }),
      role: getMemberRoleFromStoredValue(row.role),
    };
  });
}

/**
 * Returns the batch rules visible to each candidate member.
 *
 * Appearing in item_people grants no visibility: being pictured is not a key to
 * the photograph.
 */
async function _readVisibleRuleIdsByMemberId(options: {
  transaction: DatabaseExecutor;
  memberIds: readonly string[];
  ruleIds: readonly string[];
}): Promise<Map<string, Set<string>>> {
  // Use the shared visible-rule predicate correlated by member and restricted
  // to
  // the batch rules, computing their intersection in one query for all
  // candidates.

  if (options.memberIds.length === 0 || options.ruleIds.length === 0) {
    return new Map();
  }
  const rows = await options.transaction
    .selectFrom(["members as member", "visibility_rules as rule"])
    .select(["member.id as memberId", "rule.id as ruleId"])
    .where("member.id", "in", [...options.memberIds])
    .where("rule.id", "in", [...options.ruleIds])
    .where(_makeRuleVisibilityPredicateFromExpressionBuilder)
    .execute();

  return rows.reduce((byMemberId, row) => {
    const ruleIds = byMemberId.get(row.memberId) ?? new Set<string>();
    ruleIds.add(row.ruleId);
    return byMemberId.set(row.memberId, ruleIds);
  }, new Map<string, Set<string>>());
}

/**
 * Returns one recipient's figures from their visible rules, or undefined when
 * they see none of the batch.
 *
 * capturedOn is their busiest visible day; ties choose the earliest day.
 */
function _makeFiguresFromRuleDayCounts(options: {
  ruleDayCounts: readonly RuleDayCount[];
  visibleRuleIds: ReadonlySet<string>;
}): RecipientFigures | undefined {
  // Walk days in calendar order; a later day replaces the winner only when
  // strictly busier.

  const countsByDay = options.ruleDayCounts
    .filter((row) => {
      return options.visibleRuleIds.has(row.ruleId);
    })
    .reduce((byDay, row) => {
      const dayCount = (byDay.get(row.capturedOn) ?? 0) + row.itemCount;
      return byDay.set(row.capturedOn, dayCount);
    }, new Map<string, number>());

  const days = [...countsByDay.keys()].sort();
  const firstDay = days[0];
  const lastDay = days.at(-1);
  if (firstDay === undefined || lastDay === undefined) {
    return undefined;
  }

  const busiestDay = days.reduce((busiest, day) => {
    return (countsByDay.get(day) ?? 0) > (countsByDay.get(busiest) ?? 0)
      ? day
      : busiest;
  }, firstDay);

  return {
    visibleItemCount: [...countsByDay.values()].reduce((sum, count) => {
      return sum + count;
    }, 0),
    capturedOn: busiestDay,
    visibleDayCount: days.length,
    firstCapturedOn: firstDay,
    lastCapturedOn: lastDay,
  };
}

/**
 * Steps 4 and 5 of § Recipient resolution: each candidate's intersection,
 * and their own count from it. An admin sees everything, so their
 * intersection is the batch's whole rule set.
 */
function _makeRecipientsFromCandidates(options: {
  candidates: readonly Candidate[];
  ruleDayCounts: readonly RuleDayCount[];
  visibleRuleIdsByMemberId: ReadonlyMap<string, ReadonlySet<string>>;
}): Recipient[] {
  const batchRuleIds = new Set(
    options.ruleDayCounts.map((row) => {
      return row.ruleId;
    }),
  );

  return options.candidates.flatMap((candidate) => {
    const visibleRuleIds =
      candidate.role === "admin"
        ? batchRuleIds
        : (options.visibleRuleIdsByMemberId.get(candidate.memberId) ??
          new Set<string>());
    const figures = _makeFiguresFromRuleDayCounts({
      ruleDayCounts: options.ruleDayCounts,
      visibleRuleIds,
    });
    return figures === undefined ? [] : [{ candidate, figures }];
  });
}

/**
 * Returns members who can see an uploaded item, with each one's figures.
 */
export async function readRecipients(
  options: Readonly<EnqueueUploadSessionEmailsOptions>,
): Promise<Recipient[]> {
  const [ruleDayCounts, candidates] = await Promise.all([
    _readRuleDayCounts(options),
    _readCandidates(options),
  ]);
  const visibleRuleIdsByMemberId = await _readVisibleRuleIdsByMemberId({
    transaction: options.transaction,
    memberIds: candidates
      .filter((candidate) => {
        return candidate.role !== "admin";
      })
      .map((candidate) => {
        return candidate.memberId;
      }),
    ruleIds: [
      ...new Set(
        ruleDayCounts.map((row) => {
          return row.ruleId;
        }),
      ),
    ],
  });
  return _makeRecipientsFromCandidates({
    candidates,
    ruleDayCounts,
    visibleRuleIdsByMemberId,
  });
}

// Match the member and their groups against the rule visibility mode.
function _makeRuleVisibilityPredicateFromExpressionBuilder(
  eb: ExpressionBuilder<
    Database & {
      member: Database["members"];
      rule: Database["visibility_rules"];
    },
    "member" | "rule"
  >,
): Expression<SqlBool> {
  const namesMember = eb.exists(
    eb
      .selectFrom("visibility_rule_subjects as subject")
      .select("subject.id")
      .whereRef("subject.rule_id", "=", "rule.id")
      .where((subjectEb) => {
        return subjectEb.or([
          subjectEb("subject.member_id", "=", subjectEb.ref("member.id")),
          subjectEb(
            "subject.group_id",
            "in",
            subjectEb
              .selectFrom("group_members")
              .select("group_members.group_id")
              .whereRef("group_members.member_id", "=", "member.id"),
          ),
        ]);
      }),
  );
  return eb.or([
    eb("rule.mode", "=", "everyone"),
    eb.and([eb("rule.mode", "=", "only"), namesMember]),
    eb.and([eb("rule.mode", "=", "except"), eb.not(namesMember)]),
  ]);
}
