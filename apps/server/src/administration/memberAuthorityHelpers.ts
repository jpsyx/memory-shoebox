import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { InvitationsTable } from "../db/types/identityAndAccess.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { readAdminMembers } from "./readAdminMembers.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { bumpVisibilityGeneration } from "../visibility/bumpVisibilityGeneration.ts";

/** Inputs shared by administrative member mutations. */
export type MemberAuthorityOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  memberId: string;
  now: string;
};

type RemovalDetail = {
  groups: Array<{ groupId: string; name: string }>;
  sessionsRevoked: number;
};

async function _dropMemberAccess(
  options: Readonly<MemberAuthorityOptions>,
): Promise<void> {
  await options.database
    .updateTable("members")
    .set({ status: "removed", removed_at: options.now })
    .where("id", "=", options.memberId)
    .execute();
  await options.database
    .deleteFrom("sessions")
    .where("member_id", "=", options.memberId)
    .execute();
  await options.database
    .deleteFrom("group_members")
    .where("member_id", "=", options.memberId)
    .execute();
  await options.database
    .updateTable("invitations")
    .set({ revoked_at: options.now })
    .where("member_id", "=", options.memberId)
    .where("revoked_at", "is", null)
    .where("accepted_at", "is", null)
    .execute();
}

/** Refuses non-admin callers before any mutation or member lookup. */
export function requireMemberAdmin(viewer: Readonly<Viewer>): void {
  if (!viewer.isAdmin) {
    throw ApiError.forbidden("members_forbidden");
  }
}

/** Reads the target with the canonical administrative DTO inside a transaction. */
export async function getAdminMemberFromId(
  options: Readonly<MemberAuthorityOptions>,
): Promise<AdminMemberDto> {
  const directory = await readAdminMembers({
    database: options.database,
    currentSessionId: options.viewer.sessionId,
    statuses: ["active", "invited", "removed"],
    now: options.now,
  });
  const member = directory.members.find((candidate) => {
    return candidate.memberId === options.memberId;
  });
  if (member === undefined) {
    throw ApiError.notFound("members_not_found");
  }
  return member;
}

/** Recounts active admins across the catalog under the immediate writer lock. */
export async function requireActiveAdmin(
  database: DatabaseExecutor,
): Promise<void> {
  const row = await database
    .selectFrom("members")
    .select((expression) => {
      return expression.fn.count<number>("id").as("activeAdminCount");
    })
    .where("role", "=", "admin")
    .where("status", "=", "active")
    .executeTakeFirstOrThrow();
  if (row.activeAdminCount === 0) {
    throw ApiError.conflict({
      code: "members_last_admin",
      details: { activeAdminCount: 0 },
    });
  }
}

/** Requires unspent invited authority on the latest invitation in all history. */
export async function getPendingInvitationFromMember(
  options: Readonly<
    MemberAuthorityOptions & { member: Readonly<AdminMemberDto> }
  >,
): Promise<InvitationsTable> {
  const { member } = options;
  const invitation = await options.database
    .selectFrom("invitations")
    .selectAll()
    .where("member_id", "=", member.memberId)
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst();
  if (
    member.status !== "invited" ||
    invitation === undefined ||
    invitation.revoked_at !== null ||
    invitation.accepted_at !== null
  ) {
    throw ApiError.conflict({ code: "invitations_not_pending" });
  }
  return invitation;
}

async function _getRemovalDetailFromMember(
  options: Readonly<MemberAuthorityOptions>,
): Promise<RemovalDetail> {
  const [groups, sessions] = await Promise.all([
    options.database
      .selectFrom("group_members")
      .innerJoin("groups", "groups.id", "group_members.group_id")
      .select(["groups.id as groupId", "groups.name as name"])
      .where("group_members.member_id", "=", options.memberId)
      .orderBy("groups.id")
      .execute(),
    options.database
      .selectFrom("sessions")
      .select((expression) => {
        return expression.fn.count<number>("id").as("count");
      })
      .where("member_id", "=", options.memberId)
      .executeTakeFirstOrThrow(),
  ]);
  return { groups, sessionsRevoked: sessions.count };
}

/** Drops access while preserving identity, authorship and visibility subjects. */
export async function removeMemberAuthority(
  options: Readonly<
    MemberAuthorityOptions & {
      member: Readonly<AdminMemberDto>;
      kind: "member_removed" | "invitation_revoked";
    }
  >,
): Promise<void> {
  const { member, kind } = options;
  const detail =
    kind === "member_removed"
      ? await _getRemovalDetailFromMember(options)
      : { fromStatus: member.status, toStatus: "removed" };
  // Snapshot actor and device before deleting sessions, including self-removal.
  await writeActivityEvent({
    transaction: options.database,
    viewer: options.viewer,
    kind,
    subjectKind: "member",
    subjectId: member.memberId,
    subjectLabel: member.displayName,
    detail,
    now: options.now,
  });
  await _dropMemberAccess(options);
  if (kind === "member_removed") {
    await requireActiveAdmin(options.database);
  }
  await bumpVisibilityGeneration({
    executor: options.database,
    now: options.now,
  });
}
