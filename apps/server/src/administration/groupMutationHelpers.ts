import type {
  AdminGroupDto,
  CreateGroupRequest,
  RenameGroupRequest,
  ReplaceGroupMembersRequest,
  ReplaceGroupMembersResponse,
  MemberRef,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { createId } from "../db/createId.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { bumpVisibilityGeneration } from "../visibility/bumpVisibilityGeneration.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import {
  getGroupFromId,
  getAdminGroupFromId,
  requireGroupAdmin,
} from "./groupReadHelpers.ts";

type ChangeGroupOptions<Body> = {
  database: DatabaseExecutor;
  viewer: Viewer;
  body: Body;
  now: string;
};

async function _assertNameAvailable(
  options: Readonly<{
    database: DatabaseExecutor;
    name: string;
    groupId?: string;
  }>,
): Promise<void> {
  const group = await options.database
    .selectFrom("groups")
    .select("id")
    .where("name_normalized", "=", makeNormalisedNameFromName(options.name))
    .executeTakeFirst();
  if (group !== undefined && group.id !== options.groupId) {
    throw ApiError.conflict({ code: "groups_name_taken" });
  }
}

async function _getMemberRefsFromIds(
  options: Readonly<{
    database: DatabaseExecutor;
    memberIds: readonly string[];
  }>,
): Promise<MemberRef[]> {
  const memberIds = [...new Set(options.memberIds)].sort();
  if (memberIds.length === 0) {
    return [];
  }
  const members = await options.database
    .selectFrom("members")
    .select(["id", "display_name", "email"])
    .where("id", "in", memberIds)
    .where("status", "in", ["active", "invited"])
    .orderBy("id")
    .execute();
  if (members.length !== memberIds.length) {
    throw ApiError.invalidRequest({
      memberIds: ["Choose active or invited members of the Shoebox."],
    });
  }
  return members.map((member) => {
    return {
      memberId: member.id,
      displayName: getDisplayNameFromMember({
        storedDisplayName: member.display_name ?? undefined,
        email: member.email,
      }),
    };
  });
}

type InsertMembershipsOptions = {
  database: DatabaseExecutor;
  groupId: string;
  members: readonly MemberRef[];
  now: string;
};

async function _insertMemberships(
  options: Readonly<InsertMembershipsOptions>,
): Promise<void> {
  if (options.members.length === 0) {
    return;
  }
  await options.database
    .insertInto("group_members")
    .values(
      options.members.map((member) => {
        return {
          id: createId(),
          group_id: options.groupId,
          member_id: member.memberId,
          created_at: options.now,
        };
      }),
    )
    .execute();
}

async function _insertGroup(
  options: Readonly<{ database: DatabaseExecutor; name: string; now: string }>,
): Promise<string> {
  const groupId = createId();
  await options.database
    .insertInto("groups")
    .values({
      id: groupId,
      name: options.name,
      name_normalized: makeNormalisedNameFromName(options.name),
      created_at: options.now,
    })
    .execute();
  return groupId;
}

type MembershipDeltaOptions = InsertMembershipsOptions & {
  previousMembers: readonly MemberRef[];
};

async function _applyMembershipDelta(
  options: Readonly<MembershipDeltaOptions>,
): Promise<{ added: MemberRef[]; removed: MemberRef[] }> {
  const memberIds = new Set(
    options.members.map((member) => {
      return member.memberId;
    }),
  );
  const previousIds = new Set(
    options.previousMembers.map((member) => {
      return member.memberId;
    }),
  );
  const added = options.members.filter((member) => {
    return !previousIds.has(member.memberId);
  });
  const removed = options.previousMembers.filter((member) => {
    return !memberIds.has(member.memberId);
  });
  if (removed.length > 0) {
    await options.database
      .deleteFrom("group_members")
      .where("group_id", "=", options.groupId)
      .where(
        "member_id",
        "in",
        removed.map((member) => {
          return member.memberId;
        }),
      )
      .execute();
  }
  await _insertMemberships({ ...options, members: added });
  return { added, removed };
}

/** Creates a group and initial invited or active membership atomically. */
export async function createGroup(
  options: Readonly<ChangeGroupOptions<CreateGroupRequest>>,
): Promise<AdminGroupDto> {
  requireGroupAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (database) => {
      await _assertNameAvailable({ database, name: options.body.name });
      const members = await _getMemberRefsFromIds({
        database,
        memberIds: options.body.memberIds ?? [],
      });
      const groupId = await _insertGroup({
        database,
        name: options.body.name,
        now: options.now,
      });
      await _insertMemberships({ ...options, database, groupId, members });
      if (members.length > 0) {
        await bumpVisibilityGeneration({
          executor: database,
          now: options.now,
        });
      }
      await writeActivityEvent({
        transaction: database,
        viewer: options.viewer,
        kind: "group_created",
        subjectKind: "group",
        subjectId: groupId,
        subjectLabel: options.body.name,
        detail: {
          memberIds: members.map((member) => {
            return member.memberId;
          }),
        },
        now: options.now,
      });
      return getAdminGroupFromId({ database, viewer: options.viewer, groupId });
    },
  });
}

/** Renames a group without invalidating visibility authority. */
export async function renameGroup(
  options: Readonly<
    ChangeGroupOptions<RenameGroupRequest> & { groupId: string }
  >,
): Promise<AdminGroupDto> {
  requireGroupAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (database) => {
      const group = await getGroupFromId({
        database,
        groupId: options.groupId,
      });
      await _assertNameAvailable({
        database,
        name: options.body.name,
        groupId: options.groupId,
      });
      await database
        .updateTable("groups")
        .set({
          name: options.body.name,
          name_normalized: makeNormalisedNameFromName(options.body.name),
        })
        .where("id", "=", options.groupId)
        .execute();
      await writeActivityEvent({
        transaction: database,
        viewer: options.viewer,
        kind: "group_renamed",
        subjectKind: "group",
        subjectId: group.groupId,
        subjectLabel: options.body.name,
        detail: { fromName: group.name, toName: options.body.name },
        now: options.now,
      });
      return getAdminGroupFromId({
        database,
        viewer: options.viewer,
        groupId: options.groupId,
      });
    },
  });
}

/** Replaces membership, records labeled deltas and always bumps generation. */
export async function replaceGroupMembers(
  options: Readonly<
    ChangeGroupOptions<ReplaceGroupMembersRequest> & { groupId: string }
  >,
): Promise<ReplaceGroupMembersResponse> {
  requireGroupAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (database) => {
      const group = await getAdminGroupFromId({
        database,
        viewer: options.viewer,
        groupId: options.groupId,
      });
      const members = await _getMemberRefsFromIds({
        database,
        memberIds: options.body.memberIds,
      });
      const detail = await _applyMembershipDelta({
        ...options,
        database,
        members,
        previousMembers: group.members,
      });
      await bumpVisibilityGeneration({ executor: database, now: options.now });
      await writeActivityEvent({
        transaction: database,
        viewer: options.viewer,
        kind: "group_membership_changed",
        subjectKind: "group",
        subjectId: group.groupId,
        subjectLabel: group.name,
        detail,
        now: options.now,
      });
      return { members, nextCursor: null };
    },
  });
}
