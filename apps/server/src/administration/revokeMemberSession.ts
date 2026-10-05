import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import {
  type MemberAuthorityOptions,
  requireMemberAdmin,
  getAdminMemberFromId,
} from "./memberAuthorityHelpers.ts";

/**
 * Deletes one matching device with its audit snapshot, including self-revoke.
 */
export async function revokeMemberSession(
  options: Readonly<MemberAuthorityOptions & { sessionId: string }>,
): Promise<void> {
  requireMemberAdmin(options.viewer);
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      await getAdminMemberFromId({ ...options, database: transaction });
      const session = await transaction
        .selectFrom("sessions")
        .select(["id", "device_label"])
        .where("id", "=", options.sessionId)
        .where("member_id", "=", options.memberId)
        .executeTakeFirst();
      if (session === undefined) {
        throw ApiError.notFound("sessions_not_found");
      }
      await writeActivityEvent({
        transaction,
        viewer: options.viewer,
        kind: "device_revoked",
        subjectKind: "session",
        subjectId: session.id,
        subjectLabel: session.device_label,
        device: { sessionId: session.id, label: session.device_label },
        now: options.now,
      });
      await transaction
        .deleteFrom("sessions")
        .where("id", "=", options.sessionId)
        .where("member_id", "=", options.memberId)
        .execute();
    },
  });
}
