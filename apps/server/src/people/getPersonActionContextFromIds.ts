import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { getMemberRoleFromStoredValue } from "../members/getMemberRoleFromStoredValue.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../items/getVisibleItemOr404.ts";
import { assertMayEditItemContent } from "../items/itemPermissionHelpers/itemPermissionHelpers.ts";

async function _getCurrentViewer(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    now: string;
  }>,
): Promise<Viewer> {
  const member = await options.database
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
      database: options.database,
      memberId: options.viewer.memberId,
    }),
  };
}

/** Rechecks session, role and visibility after acquiring the writer lock. */
export async function getPersonActionContextFromIds(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    itemId: string;
    personId: string;
    now: string;
  }>,
): Promise<{
  viewer: Viewer;
  item: VisibleItem;
  person: Pick<
    Database["people"],
    "id" | "member_id" | "created_by" | "display_name"
  >;
}> {
  const viewer = await _getCurrentViewer(options);
  const item = await getVisibleItemOr404({
    database: options.database,
    viewer,
    itemId: options.itemId,
  });
  assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });
  const person = await options.database
    .selectFrom("people")
    .select(["id", "member_id", "created_by", "display_name"])
    .where("id", "=", options.personId)
    .executeTakeFirst();
  if (person === undefined) {
    throw ApiError.notFound("person_not_found");
  }
  if (person.member_id !== null) {
    throw ApiError.forbidden("person_linked_member");
  }
  return { viewer, item, person };
}
