import type { AdminMemberDto } from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import {
  type MemberAuthorityOptions,
  requireMemberAdmin,
  getAdminMemberFromId,
  getPendingInvitationFromMember,
  removeMemberAuthority,
} from "./memberAuthorityHelpers.ts";

/** Revokes a pending invitation and all invited authority as one audited action. */
export async function revokeMemberInvitation(
  options: Readonly<MemberAuthorityOptions>,
): Promise<AdminMemberDto> {
  requireMemberAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const transactionOptions = { ...options, database: transaction };
      const member = await getAdminMemberFromId(transactionOptions);
      await getPendingInvitationFromMember({ ...transactionOptions, member });
      await removeMemberAuthority({
        ...transactionOptions,
        member,
        kind: "invitation_revoked",
      });
      return getAdminMemberFromId(transactionOptions);
    },
  });
}
