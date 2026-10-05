import type { AdminMemberDto } from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import {
  type MemberAuthorityOptions,
  requireMemberAdmin,
  getAdminMemberFromId,
  removeMemberAuthority,
} from "./memberAuthorityHelpers.ts";

/**
 * Removes access and memberships with a last-admin guard, retaining authorship.
 */
export async function removeMember(
  options: Readonly<MemberAuthorityOptions>,
): Promise<AdminMemberDto> {
  requireMemberAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const transactionOptions = { ...options, database: transaction };
      const member = await getAdminMemberFromId(transactionOptions);
      if (member.status === "removed") {
        throw ApiError.conflict({ code: "members_already_removed" });
      }
      await removeMemberAuthority({
        ...transactionOptions,
        member,
        kind: "member_removed",
      });
      return getAdminMemberFromId(transactionOptions);
    },
  });
}
