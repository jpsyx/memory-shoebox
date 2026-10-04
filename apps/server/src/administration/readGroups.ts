import type { AdminGroupDto, ListGroupsResponse } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

/** Refuses callers without administrative group authority. */
export function requireGroupAdmin(viewer: Readonly<Viewer>): void {
  if (!viewer.isAdmin) {
    throw ApiError.forbidden("groups_forbidden");
  }
}

/** Reads one group or returns the group domain's not-found envelope. */
export async function getGroupFromId(
  options: Readonly<{ database: DatabaseExecutor; groupId: string }>,
): Promise<{ groupId: string; name: string; createdAt: string }> {
  const group = await options.database
    .selectFrom("groups")
    .select(["id as groupId", "name", "created_at as createdAt"])
    .where("id", "=", options.groupId)
    .executeTakeFirst();
  if (group === undefined) {
    throw ApiError.notFound("groups_not_found");
  }
  return group;
}

type GroupMembership = {
  groupId: string;
  memberId: string;
  displayName: string;
};
type GroupItemCount = {
  group_id: string | null;
  mode: string;
  itemCount: number;
};

async function _readGroupMemberships(
  database: DatabaseExecutor,
  groupIds: readonly string[],
): Promise<GroupMembership[]> {
  const members = await database
    .selectFrom("group_members")
    .innerJoin("members", "members.id", "group_members.member_id")
    .select([
      "group_id",
      "members.id as memberId",
      "members.display_name",
      "members.email",
    ])
    .where("group_id", "in", [...groupIds])
    .orderBy("members.id")
    .execute();
  return members.map((member) => {
    return {
      groupId: member.group_id,
      memberId: member.memberId,
      displayName: getDisplayNameFromMember({
        storedDisplayName: member.display_name ?? undefined,
        email: member.email,
      }),
    };
  });
}

async function _readGroupItemCounts(
  database: DatabaseExecutor,
  groupIds: readonly string[],
): Promise<GroupItemCount[]> {
  return database
    .selectFrom("visibility_rule_subjects")
    .innerJoin(
      "visibility_rules",
      "visibility_rules.id",
      "visibility_rule_subjects.rule_id",
    )
    .leftJoin("items", "items.visibility_rule_id", "visibility_rules.id")
    .select(["group_id", "mode"])
    .select((expression) => {
      return expression.fn.count<number>("items.id").as("itemCount");
    })
    .where("group_id", "in", [...groupIds])
    .groupBy(["group_id", "mode"])
    .execute();
}

async function _readAdminGroups(
  database: DatabaseExecutor,
  groups: ReadonlyArray<{ groupId: string; name: string; createdAt: string }>,
): Promise<AdminGroupDto[]> {
  if (groups.length === 0) {
    return [];
  }
  const groupIds = groups.map((group) => {
    return group.groupId;
  });
  const [memberships, counts] = await Promise.all([
    _readGroupMemberships(database, groupIds),
    _readGroupItemCounts(database, groupIds),
  ]);
  return groups.map((group) => {
    return {
      ...group,
      members: memberships
        .filter((membership) => {
          return membership.groupId === group.groupId;
        })
        .map(({ memberId, displayName }) => {
          return { memberId, displayName };
        }),
      usedByOnlyRules:
        counts.find((count) => {
          return count.group_id === group.groupId && count.mode === "only";
        })?.itemCount ?? 0,
      usedByExceptRules:
        counts.find((count) => {
          return count.group_id === group.groupId && count.mode === "except";
        })?.itemCount ?? 0,
    };
  });
}

/** Reads all groups in the role-selected administrative or picker shape. */
export async function readGroups(
  options: Readonly<{ database: DatabaseExecutor; viewer: Viewer }>,
): Promise<ListGroupsResponse> {
  if (options.viewer.role === "viewer") {
    throw ApiError.forbidden("groups_forbidden");
  }
  const groups = await options.database
    .selectFrom("groups")
    .select(["id as groupId", "name", "created_at as createdAt"])
    .orderBy("id")
    .execute();
  if (!options.viewer.isAdmin) {
    return {
      shape: "picker",
      groups: groups.map(({ groupId, name }) => {
        return { groupId, name };
      }),
      nextCursor: null,
    };
  }
  return {
    shape: "admin",
    groups: await _readAdminGroups(options.database, groups),
    nextCursor: null,
  };
}

/** Reads a single administrative DTO using the batched directory shape. */
export async function getAdminGroupFromId(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    groupId: string;
  }>,
): Promise<AdminGroupDto> {
  requireGroupAdmin(options.viewer);
  const group = await getGroupFromId(options);
  return (await _readAdminGroups(options.database, [group]))[0]!;
}
