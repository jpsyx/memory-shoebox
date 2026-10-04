import type { AdminMemberDto, MemberRole } from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { bumpVisibilityGeneration } from "../visibility/bumpVisibilityGeneration.ts";
import {
  type MemberAuthorityOptions,
  requireMemberAdmin,
  getAdminMemberFromId,
  requireActiveAdmin,
} from "./memberAuthorityHelpers.ts";

/** Changes active or offered authority with an atomic last-active-admin guard. */
export async function changeMemberRole(
  options: Readonly<MemberAuthorityOptions & { role: MemberRole }>,
): Promise<AdminMemberDto> {
  requireMemberAdmin(options.viewer);
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const transactionOptions = { ...options, database: transaction };
      const member = await getAdminMemberFromId(transactionOptions);
      if (member.status === "removed") {
        throw ApiError.conflict({ code: "members_not_active" });
      }
      await transaction
        .updateTable("members")
        .set({ role: options.role })
        .where("id", "=", member.memberId)
        .execute();
      await requireActiveAdmin(transaction);
      await writeActivityEvent({
        transaction,
        viewer: options.viewer,
        kind: "member_role_changed",
        subjectKind: "member",
        subjectId: member.memberId,
        subjectLabel: member.displayName,
        detail: { fromRole: member.role, toRole: options.role },
        now: options.now,
      });
      await bumpVisibilityGeneration({
        executor: transaction,
        now: options.now,
      });
      return getAdminMemberFromId(transactionOptions);
    },
  });
}
