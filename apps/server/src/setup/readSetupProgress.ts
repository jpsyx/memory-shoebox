import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";

/** Returns durable invitation progress only to a currently active admin. */
export async function readSetupProgress(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
  }>,
): Promise<{ needsInvitations: boolean }> {
  const member = await options.database
    .selectFrom("members")
    .select(["role", "status"])
    .where("id", "=", options.viewer.memberId)
    .executeTakeFirst();
  if (
    !options.viewer.isAdmin ||
    member?.role !== "admin" ||
    member.status !== "active"
  ) {
    throw ApiError.forbidden("setup_forbidden");
  }
  const settings = await readInstanceSettings({
    database: options.database,
    keys: ["setup.pending_member_id"],
  });
  return {
    needsInvitations:
      settings["setup.pending_member_id"] === options.viewer.memberId,
  };
}
