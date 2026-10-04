import {
  adminMemberDtoSchema,
  type AdminMemberDto,
  type ListMembersResponse,
  type MemberStatus,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type {
  InvitationsTable,
  MembersTable,
  SessionsTable,
} from "../db/types/identityAndAccess.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

type ReadAdminMembersOptions = {
  database: DatabaseExecutor;
  currentSessionId: string;
  statuses: readonly MemberStatus[];
  now: string;
};
type InvitationRow = InvitationsTable & {
  inviterName: string | null;
  inviterEmail: string;
};
type MemberFacts = {
  member: MembersTable;
  invitation: InvitationRow | undefined;
  sessions: readonly SessionsTable[];
  activeAdminCount: number;
  currentSessionId: string;
  now: string;
};

type AdminDirectoryRows = {
  members: readonly MembersTable[];
  sessions: readonly SessionsTable[];
  invitations: readonly InvitationRow[];
  activeAdminCount: number;
  currentSessionId: string;
  now: string;
};

function _makeInvitationDtoFromRow(
  invitation: InvitationRow | undefined,
  now: string,
): AdminMemberDto["invitation"] {
  if (invitation === undefined) {
    return null;
  }
  return {
    invitationId: invitation.id,
    invitedBy: {
      memberId: invitation.invited_by_member_id,
      displayName: getDisplayNameFromMember({
        storedDisplayName: invitation.inviterName ?? undefined,
        email: invitation.inviterEmail,
      }),
    },
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
    sendCount: invitation.send_count,
    lastSentAt: invitation.last_sent_at,
    revokedAt: invitation.revoked_at,
    acceptedAt: invitation.accepted_at,
    isPending:
      invitation.revoked_at === null &&
      invitation.accepted_at === null &&
      invitation.expires_at > now,
  };
}

function _makeAdminMemberFromFacts(
  options: Readonly<MemberFacts>,
): AdminMemberDto {
  const { member, invitation } = options;
  return adminMemberDtoSchema.parse({
    memberId: member.id,
    displayName: getDisplayNameFromMember({
      storedDisplayName: member.display_name ?? undefined,
      email: member.email,
    }),
    email: member.email,
    role: member.role,
    status: member.status,
    joinedAt: member.joined_at,
    lastSignedInAt: member.last_signed_in_at,
    lastSeenAt: member.last_seen_at,
    removedAt: member.removed_at,
    createdAt: member.created_at,
    isLastActiveAdmin:
      member.role === "admin" &&
      member.status === "active" &&
      options.activeAdminCount === 1,
    invitation: _makeInvitationDtoFromRow(invitation, options.now),
    sessions: options.sessions.map((session) => {
      return {
        sessionId: session.id,
        deviceLabel: session.device_label,
        createdAt: session.created_at,
        lastUsedAt: session.last_used_at,
        expiresAt: session.expires_at,
        isCurrent: session.id === options.currentSessionId,
      };
    }),
  });
}

async function _readLatestInvitations(
  database: DatabaseExecutor,
): Promise<InvitationRow[]> {
  return database
    .selectFrom("invitations")
    .innerJoin(
      "members as inviter",
      "inviter.id",
      "invitations.invited_by_member_id",
    )
    .selectAll("invitations")
    .select([
      "inviter.display_name as inviterName",
      "inviter.email as inviterEmail",
    ])
    .where("invitations.id", "in", (eb) => {
      return eb
        .selectFrom("invitations as history")
        .select((history) => {
          return history.fn.max<string>("history.id").as("latestId");
        })
        .groupBy("history.member_id");
    })
    .execute();
}

async function _readMemberFacts(
  options: Readonly<{
    database: DatabaseExecutor;
    memberIds: readonly string[];
    now: string;
  }>,
): Promise<[SessionsTable[], InvitationRow[]]> {
  const { memberIds } = options;
  return Promise.all([
    options.database
      .selectFrom("sessions")
      .selectAll()
      .where("member_id", "in", memberIds.length === 0 ? [""] : memberIds)
      .where("expires_at", ">", options.now)
      .orderBy("last_used_at", "desc")
      .execute(),
    _readLatestInvitations(options.database),
  ]);
}

/** Reads administrative members and their live devices in three batch queries. */
export async function readAdminMembers(
  options: Readonly<ReadAdminMembersOptions>,
): Promise<Extract<ListMembersResponse, { shape: "admin" }>> {
  const members = await options.database
    .selectFrom("members")
    .selectAll()
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const activeAdminCount = members.filter((member) => {
    return member.status === "active" && member.role === "admin";
  }).length;
  const selectedMembers = members.filter((member) => {
    return options.statuses.some((status) => {
      return status === member.status;
    });
  });
  const [sessions, invitations] = await _readMemberFacts({
    database: options.database,
    memberIds: selectedMembers.map((member) => {
      return member.id;
    }),
    now: options.now,
  });
  return _makeAdminDirectoryFromRows({
    members: selectedMembers,
    sessions,
    invitations,
    activeAdminCount,
    currentSessionId: options.currentSessionId,
    now: options.now,
  });
}

function _makeAdminDirectoryFromRows(
  options: Readonly<AdminDirectoryRows>,
): Extract<ListMembersResponse, { shape: "admin" }> {
  const { sessions, invitations, activeAdminCount } = options;
  const sessionsByMember = new Map<string, SessionsTable[]>();
  sessions.forEach((session) => {
    const bucket = sessionsByMember.get(session.member_id) ?? [];
    bucket.push(session);
    sessionsByMember.set(session.member_id, bucket);
  });
  const invitationsByMember = new Map(
    invitations.map((invitation) => {
      return [invitation.member_id, invitation];
    }),
  );
  return {
    shape: "admin",
    nextCursor: null,
    activeAdminCount,
    members: options.members.map((member) => {
      return _makeAdminMemberFromFacts({
        member,
        invitation: invitationsByMember.get(member.id),
        sessions: sessionsByMember.get(member.id) ?? [],
        activeAdminCount,
        currentSessionId: options.currentSessionId,
        now: options.now,
      });
    }),
  };
}
