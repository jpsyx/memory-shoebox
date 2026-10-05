import type { AdminMemberDto } from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { checkInvitationResendLimit } from "../http/rateLimit/checkInvitationResendLimit.ts";
import { enqueueInvitationEmail } from "../mail/enqueueInvitationEmail.ts";
import {
  type MemberAuthorityOptions,
  requireMemberAdmin,
  getAdminMemberFromId,
  getPendingInvitationFromMember,
} from "./memberAuthorityHelpers.ts";

async function _resendInvitation(
  options: Readonly<MemberAuthorityOptions>,
): Promise<AdminMemberDto> {
  const member = await getAdminMemberFromId(options);
  const invitation = await getPendingInvitationFromMember({
    ...options,
    member,
  });
  // Recheck under the writer lock so concurrent sends cannot bypass middleware.
  const limit = await checkInvitationResendLimit(options);
  if (!limit.isAllowed) {
    throw ApiError.rateLimited(limit.retryAfterSeconds);
  }
  const expiresAt = new Date(
    Date.parse(options.now) + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const sendCount = invitation.send_count + 1;
  await options.database
    .updateTable("invitations")
    .set({
      send_count: sendCount,
      last_sent_at: options.now,
      expires_at: expiresAt,
    })
    .where("id", "=", invitation.id)
    .execute();
  await enqueueInvitationEmail({
    transaction: options.database,
    invitationId: invitation.id,
    inviterMemberId: invitation.invited_by_member_id,
    invitedMemberId: member.memberId,
    sendCount,
    expiresAt,
    now: options.now,
  });
  return getAdminMemberFromId(options);
}

/**
 * Resends the same invitation with persisted limits and atomic mail enqueue.
 */
export async function resendMemberInvitation(
  options: Readonly<MemberAuthorityOptions>,
): Promise<AdminMemberDto> {
  requireMemberAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: (transaction) => {
      return _resendInvitation({ ...options, database: transaction });
    },
  });
}
