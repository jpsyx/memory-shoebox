import type {
  GroupUsageResponse,
  GroupUsageRuleDto,
  VisibilitySummary,
  MemberRef,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { readVisibilitySummaries } from "../archive/readVisibilitySummaries.ts";
import { makeLabelFromSubjects } from "../archive/makeLabelFromSubjects.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import { getGroupFromId } from "./readGroups.ts";
import { makeGroupUsageTokenFromSnapshot } from "./groupUsageTokenHelpers.ts";

type UsageOptions = {
  database: DatabaseExecutor;
  groupId: string;
  secret: string;
  now: string;
};
type AudienceMember = {
  id: string;
  role: string;
  status: string;
  displayName: string;
};
type AudienceMembership = { group_id: string; member_id: string };
type UsageItem = {
  id: string;
  visibility_rule_id: string;
  uploaded_by: string;
};
type UsageFacts = {
  summaries: VisibilitySummary[];
  memberships: AudienceMembership[];
  members: AudienceMember[];
  items: UsageItem[];
};

async function _readRuleSummaries(
  options: Readonly<UsageOptions>,
): Promise<VisibilitySummary[]> {
  const namedRules = await options.database
    .selectFrom("visibility_rule_subjects")
    .select("rule_id")
    .where("group_id", "=", options.groupId)
    .orderBy("rule_id")
    .execute();
  const ruleIds = namedRules.map((rule) => {
    return rule.rule_id;
  });
  const summariesById = await readVisibilitySummaries({
    database: options.database,
    ruleIds,
  });
  return ruleIds.map((ruleId) => {
    const summary = summariesById.get(ruleId)!;
    return {
      ...summary,
      subjects: [...summary.subjects].sort((left, right) => {
        return (
          left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
        );
      }),
    };
  });
}

async function _readAudienceMembers(
  database: DatabaseExecutor,
): Promise<AudienceMember[]> {
  const members = await database
    .selectFrom("members")
    .select(["id", "role", "status", "display_name", "email"])
    .orderBy("id")
    .execute();
  return members.map((member) => {
    return {
      id: member.id,
      role: member.role,
      status: member.status,
      displayName: getDisplayNameFromMember({
        storedDisplayName: member.display_name ?? undefined,
        email: member.email,
      }),
    };
  });
}

async function _readAffectedItems(
  database: DatabaseExecutor,
  ruleIds: readonly string[],
): Promise<UsageItem[]> {
  if (ruleIds.length === 0) {
    return [];
  }
  return database
    .selectFrom("items")
    .select(["id", "visibility_rule_id", "uploaded_by"])
    .where("visibility_rule_id", "in", [...ruleIds])
    .orderBy("id")
    .execute();
}

async function _readUsageFacts(
  options: Readonly<UsageOptions>,
): Promise<UsageFacts> {
  const summaries = await _readRuleSummaries(options);
  const groupIds = [
    ...new Set([
      options.groupId,
      ...summaries.flatMap((summary) => {
        return summary.subjects.flatMap((subject) => {
          return subject.kind === "group" ? [subject.id] : [];
        });
      }),
    ]),
  ].sort();
  const [memberships, members, items] = await Promise.all([
    options.database
      .selectFrom("group_members")
      .select(["group_id", "member_id"])
      .where("group_id", "in", groupIds)
      .orderBy("group_id")
      .orderBy("member_id")
      .execute(),
    _readAudienceMembers(options.database),
    _readAffectedItems(
      options.database,
      summaries.map((summary) => {
        return summary.visibilityRuleId;
      }),
    ),
  ]);
  return { summaries, memberships, members, items };
}

function _getAudienceFromSubjects(
  subjects: VisibilitySummary["subjects"],
  memberships: readonly AudienceMembership[],
): Set<string> {
  return new Set(
    subjects.flatMap((subject) => {
      return subject.kind === "member"
        ? [subject.id]
        : memberships
            .filter((membership) => {
              return membership.group_id === subject.id;
            })
            .map((membership) => {
              return membership.member_id;
            });
    }),
  );
}

function _makeUsageRuleFromSummary(
  summary: Readonly<VisibilitySummary>,
  options: Readonly<{ groupId: string; items: readonly UsageItem[] }>,
): GroupUsageRuleDto {
  const mode = summary.mode === "only" ? "only" : "except";
  const subjects = summary.subjects.filter((subject) => {
    return subject.kind !== "group" || subject.id !== options.groupId;
  });
  return {
    ruleId: summary.visibilityRuleId,
    visibility: { ...summary, mode },
    effect: mode === "only" ? "narrows" : "widens",
    itemCount: options.items.filter((item) => {
      return item.visibility_rule_id === summary.visibilityRuleId;
    }).length,
    visibilityAfter: {
      ...summary,
      subjects,
      label: makeLabelFromSubjects({ mode, subjects }),
    },
    becomesEmptyAllowList: mode === "only" && subjects.length === 0,
  };
}

function _getChangedIdsFromRule(
  options: Readonly<{ facts: UsageFacts; rule: GroupUsageRuleDto }>,
): string[] {
  const { facts, rule } = options;
  const audienceBefore = _getAudienceFromSubjects(
    rule.visibility.subjects,
    facts.memberships,
  );
  const audienceAfter = _getAudienceFromSubjects(
    rule.visibilityAfter.subjects,
    facts.memberships,
  );
  const items = facts.items.filter((item) => {
    return item.visibility_rule_id === rule.ruleId;
  });
  return [...audienceBefore].filter((memberId) => {
    return (
      !audienceAfter.has(memberId) &&
      items.some((item) => {
        return item.uploaded_by !== memberId;
      })
    );
  });
}

function _getChangedMembersFromRules(
  options: Readonly<{
    facts: UsageFacts;
    rules: readonly GroupUsageRuleDto[];
    effect: "narrows" | "widens";
  }>,
): MemberRef[] {
  const changedIds = new Set(
    options.rules
      .filter((rule) => {
        return rule.effect === options.effect;
      })
      .flatMap((rule) => {
        return _getChangedIdsFromRule({ facts: options.facts, rule });
      }),
  );
  return options.facts.members
    .filter((member) => {
      return (
        changedIds.has(member.id) &&
        member.role !== "admin" &&
        (member.status === "active" || member.status === "invited")
      );
    })
    .map((member) => {
      return {
        memberId: member.id,
        displayName: member.displayName,
      };
    });
}

function _getDirectionalCountsFromRules(
  rules: readonly GroupUsageRuleDto[],
): Pick<
  GroupUsageResponse,
  "narrowingItemCount" | "wideningItemCount" | "emptyAllowListItemCount"
> {
  return rules.reduce(
    (counts, rule) => {
      return {
        narrowingItemCount:
          counts.narrowingItemCount +
          (rule.effect === "narrows" ? rule.itemCount : 0),
        wideningItemCount:
          counts.wideningItemCount +
          (rule.effect === "widens" ? rule.itemCount : 0),
        emptyAllowListItemCount:
          counts.emptyAllowListItemCount +
          (rule.becomesEmptyAllowList ? rule.itemCount : 0),
      };
    },
    { narrowingItemCount: 0, wideningItemCount: 0, emptyAllowListItemCount: 0 },
  );
}

/** Reads the usage and the same canonical facts consumed during deletion. */
export async function readGroupUsageSnapshot(
  options: Readonly<UsageOptions>,
): Promise<{ usage: GroupUsageResponse; snapshot: string }> {
  const { groupId, name } = await getGroupFromId(options);
  const facts = await _readUsageFacts(options);
  const rules = facts.summaries.map((summary) => {
    return _makeUsageRuleFromSummary(summary, { groupId, items: facts.items });
  });
  const snapshot = JSON.stringify({ group: { groupId, name }, ...facts });
  const usage: GroupUsageResponse = {
    group: { groupId, name },
    rules,
    ..._getDirectionalCountsFromRules(rules),
    membersLosingAccess: _getChangedMembersFromRules({
      facts,
      rules,
      effect: "narrows",
    }),
    membersGainingAccess: _getChangedMembersFromRules({
      facts,
      rules,
      effect: "widens",
    }),
    confirmationToken:
      rules.length === 0
        ? null
        : makeGroupUsageTokenFromSnapshot({
            snapshot,
            secret: options.secret,
            now: options.now,
          }),
  };
  return { usage, snapshot };
}

/** Reports both access directions without changing any catalog state. */
export async function readGroupUsage(
  options: Readonly<UsageOptions>,
): Promise<GroupUsageResponse> {
  return (await readGroupUsageSnapshot(options)).usage;
}
