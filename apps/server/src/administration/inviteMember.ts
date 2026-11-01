import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import { claimMemberName } from "../members/claimMemberName.ts";
import { syncMemberPerson } from "../members/syncMemberPerson.ts";
import { accountNameSchema } from "@memory-shoebox/shared";
import type {
  AdminMemberDto,
  InviteMemberRequest,
} from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { enqueueInvitationEmail } from "../mail/enqueueInvitationEmail.ts";
import { readAdminMembers } from "./readAdminMembers.ts";

type InviteMemberOptions = {
  b2: B2Client;
  database: DatabaseExecutor;
  viewer: Viewer;
  body: InviteMemberRequest;
  now: string;
};

type InsertInvitationOptions = {
  transaction: DatabaseExecutor;
  invitationId: string;
  memberId: string;
  inviterMemberId: string;
  now: string;
  expiresAt: string;
};
type RecordInvitationOptions = {
  transaction: DatabaseExecutor;
  invitationId: string;
  member: AdminMemberDto;
  viewer: Viewer;
  now: string;
  expiresAt: string;
};
type ReadInvitedMemberOptions = {
  b2: B2Client;
  transaction: DatabaseExecutor;
  memberId: string;
  sessionId: string;
  now: string;
};

async function _insertInvitedMember(
  options: Readonly<{
    transaction: DatabaseExecutor;
    body: InviteMemberRequest;
    now: string;
  }>,
): Promise<string> {
  const { transaction, body, now } = options;
  const memberId = createId();
  await transaction
    .insertInto("members")
    .values({
      id: memberId,
      email: body.email,
      display_name: null,
      suggested_display_name: body.displayName ?? null,
      role: body.role,
      status: "invited",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: null,
      last_signed_in_at: null,
      last_seen_at: null,
      removed_at: null,
      created_at: now,
    })
    .execute();
  return memberId;
}

async function _inviteIdentity(
  options: Readonly<{
    transaction: DatabaseExecutor;
    body: InviteMemberRequest;
    now: string;
  }>,
): Promise<string> {
  const { transaction, body } = options;
  const existing = await transaction
    .selectFrom("members")
    .select(["id", "status", "profile_completed_at"])
    .where("email", "=", body.email)
    .executeTakeFirst();
  if (existing !== undefined && existing.status !== "removed") {
    throw ApiError.conflict({
      code:
        existing.status === "active"
          ? "members_already_active"
          : "members_invitation_pending",
      details: { memberId: existing.id },
    });
  }
  if (existing !== undefined) {
    await _restoreInvitedMember({ ...options, existing });
    return existing.id;
  }
  return _insertInvitedMember(options);
}

function _getSuggestionPatchFromRestoration(
  options: Readonly<{
    body: InviteMemberRequest;
    hasClaim: boolean;
    isComplete: boolean;
  }>,
): { suggested_display_name?: string | null } {
  const { body, hasClaim, isComplete } = options;
  if (body.displayName === undefined) {
    return {};
  }
  if (hasClaim && isComplete) {
    return { suggested_display_name: null };
  }
  return {
    suggested_display_name:
      hasClaim && body.displayName !== null
        ? accountNameSchema.parse(body.displayName)
        : body.displayName,
  };
}

async function _restoreInvitedMember(
  options: Readonly<{
    transaction: DatabaseExecutor;
    body: InviteMemberRequest;
    now: string;
    existing: { id: string; profile_completed_at: string | null };
  }>,
): Promise<void> {
  const { transaction, existing, body, now } = options;
  const claim = await transaction
    .selectFrom("member_name_claims")
    .select("member_id")
    .where("member_id", "=", existing.id)
    .executeTakeFirst();
  if (claim && body.displayName !== undefined) {
    if (body.displayName === null) {
      throw ApiError.invalidRequest({
        displayName: ["A claimed name cannot be cleared."],
      });
    }
    await claimMemberName({
      transaction,
      memberId: existing.id,
      displayName: body.displayName,
      now,
    });
  }
  // An admin restoring a legacy claim cannot complete an unverified identity.
  const suggestion = _getSuggestionPatchFromRestoration({
    body,
    hasClaim: claim !== undefined,
    isComplete: existing.profile_completed_at !== null,
  });
  await transaction
    .updateTable("members")
    .set({
      status: "invited",
      removed_at: null,
      role: body.role,
      profile_completed_at: existing.profile_completed_at,
      ...suggestion,
    })
    .where("id", "=", existing.id)
    .execute();
}

async function _insertInvitation(
  options: Readonly<InsertInvitationOptions>,
): Promise<void> {
  const { transaction, invitationId, memberId, expiresAt } = options;
  await transaction
    .insertInto("invitations")
    .values({
      id: invitationId,
      member_id: memberId,
      invited_by_member_id: options.inviterMemberId,
      created_at: options.now,
      expires_at: expiresAt,
      send_count: 1,
      last_sent_at: options.now,
      revoked_at: null,
      accepted_at: null,
    })
    .execute();
}

async function _recordInvitation(
  options: Readonly<RecordInvitationOptions>,
): Promise<void> {
  const { transaction, invitationId, member, expiresAt } = options;
  const memberId = member.memberId;
  await writeActivityEvent({
    transaction,
    viewer: options.viewer,
    kind: "member_invited",
    subjectKind: "member",
    subjectId: memberId,
    subjectLabel: member.displayName,
    detail: { role: member.role },
    now: options.now,
  });
  await enqueueInvitationEmail({
    transaction,
    invitationId,
    inviterMemberId: options.viewer.memberId,
    invitedMemberId: memberId,
    sendCount: 1,
    expiresAt,
    now: options.now,
  });
}

async function _readInvitedMember(
  options: Readonly<ReadInvitedMemberOptions>,
): Promise<AdminMemberDto> {
  const { transaction, memberId } = options;
  const directory = await readAdminMembers({
    b2: options.b2,
    database: transaction,
    currentSessionId: options.sessionId,
    statuses: ["invited"],
    now: options.now,
  });
  const member = directory.members.find((row) => {
    return row.memberId === memberId;
  });
  if (member === undefined) {
    throw new Error("Invited member was not readable in its transaction.");
  }
  return member;
}

/** Invites or restores one identity, committing audit and mail atomically. */
export async function inviteMember(
  options: Readonly<InviteMemberOptions>,
): Promise<AdminMemberDto> {
  if (!options.viewer.isAdmin) {
    throw ApiError.forbidden("members_forbidden");
  }
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const memberId = await _inviteIdentity({
        transaction,
        body: options.body,
        now: options.now,
      });
      await syncMemberPerson({ transaction, memberId, now: options.now });
      const invitationId = createId();
      const expiresAt = new Date(
        Date.parse(options.now) + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await _insertInvitation({
        transaction,
        invitationId,
        memberId,
        inviterMemberId: options.viewer.memberId,
        now: options.now,
        expiresAt,
      });
      const member = await _readInvitedMember({
        b2: options.b2,
        transaction,
        memberId,
        sessionId: options.viewer.sessionId,
        now: options.now,
      });
      await _recordInvitation({
        transaction,
        invitationId,
        member,
        viewer: options.viewer,
        now: options.now,
        expiresAt,
      });
      return member;
    },
  });
}
