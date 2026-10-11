import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { getMemberRoleFromStoredValue } from "../../members/getMemberRoleFromStoredValue.ts";
import { getVisibleRuleIdsFromMemberId } from "../../visibility/getVisibleRuleIdsFromMemberId.ts";

/** Rechecks live authority and rule membership after acquiring the write lock. */
export async function getBulkEditViewerFromTransaction(options: {
  transaction: DatabaseExecutor;
  viewer: Readonly<Viewer>;
  now: string;
}): Promise<Viewer> {
  const member = await options.transaction
    .selectFrom("members")
    .innerJoin("sessions", "sessions.member_id", "members.id")
    .select("members.role")
    .where("members.id", "=", options.viewer.memberId)
    .where("members.status", "=", "active")
    .where("sessions.id", "=", options.viewer.sessionId)
    .where("sessions.expires_at", ">", options.now)
    .executeTakeFirst();
  if (member === undefined) {
    throw ApiError.notSignedIn();
  }
  const role = getMemberRoleFromStoredValue(member.role);
  return {
    ...options.viewer,
    role,
    isAdmin: role === "admin",
    visibleRuleIds: await getVisibleRuleIdsFromMemberId({
      database: options.transaction,
      memberId: options.viewer.memberId,
    }),
  };
}
