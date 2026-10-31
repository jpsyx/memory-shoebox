import {
  makeAccountNameKeyFromName,
  memberRoleSchema,
  type MemberRef,
} from "@memory-shoebox/shared";
import { readMemberAvatars } from "../avatars/readMemberAvatars.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { VisibleItem } from "../items/getVisibleItemOr404.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";

type EligibleMember = { memberId: string; displayName: string };

async function _canMemberSeeItem(
  options: Readonly<{ database: DatabaseExecutor; itemId: string }>,
  member: Readonly<{ memberId: string; role: string }>,
): Promise<boolean> {
  const viewer: Viewer = {
    memberId: member.memberId,
    sessionId: "",
    role: memberRoleSchema.parse(member.role),
    isAdmin: member.role === "admin",
    profileComplete: true,
    visibleRuleIds: await getVisibleRuleIdsFromMemberId({
      database: options.database,
      memberId: member.memberId,
    }),
  };
  const visible = await applyVisibilityFilter({
    viewer,
    query: options.database
      .selectFrom("items")
      .select("id")
      .where("id", "=", options.itemId),
  }).executeTakeFirst();
  return visible !== undefined;
}

/** Reads current active, named members through the item's real visibility predicate. */
export async function readEligibleCommentTagMembers(
  options: Readonly<{
    database: DatabaseExecutor;
    itemId: string;
    memberIds?: readonly string[];
  }>,
): Promise<EligibleMember[]> {
  if (options.memberIds?.length === 0) return [];
  let query = options.database
    .selectFrom("members")
    .select(["id as memberId", "display_name as displayName", "role"])
    .where("status", "=", "active")
    .where("profile_completed_at", "is not", null)
    .where("display_name", "is not", null);
  if (options.memberIds !== undefined)
    query = query.where("id", "in", options.memberIds);
  const eligible: EligibleMember[] = [];
  for (const member of await query.execute()) {
    if (!member.displayName?.trim()) continue;
    if (await _canMemberSeeItem(options, member))
      eligible.push({
        memberId: member.memberId,
        displayName: member.displayName,
      });
  }
  return eligible;
}

function _getMatchRank(name: string, query: string): number {
  return name === query ? 0 : name.startsWith(query) ? 1 : 2;
}

function _compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function _getMatchesFromMembers(
  members: readonly EligibleMember[],
  query: string,
): EligibleMember[] {
  return members
    .map((member) => {
      return {
        ...member,
        key: makeAccountNameKeyFromName(member.displayName),
      };
    })
    .filter((member) => {
      return member.key.includes(query);
    })
    .sort((left, right) => {
      return (
        _getMatchRank(left.key, query) - _getMatchRank(right.key, query) ||
        _compareKeys(left.key, right.key) ||
        _compareKeys(left.memberId, right.memberId)
      );
    });
}

/** Searches authorized candidates with N1 keys and deterministic code-unit ordering. */
export async function readCommentTagCandidates(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    item: VisibleItem;
    b2: B2Client;
    query: string;
    now: string;
  }>,
): Promise<MemberRef[]> {
  const query = makeAccountNameKeyFromName(options.query);
  const members = _getMatchesFromMembers(
    await readEligibleCommentTagMembers({
      database: options.database,
      itemId: options.item.itemId,
    }),
    query,
  );
  const avatars = await readMemberAvatars({
    ...options,
    memberIds: members.map((member) => {
      return member.memberId;
    }),
  });
  return members.map((member) => {
    return {
      memberId: member.memberId,
      displayName: member.displayName,
      avatar: avatars.get(member.memberId) ?? null,
    };
  });
}
