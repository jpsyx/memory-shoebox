import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { saveInstanceSetting } from "../settings/saveInstanceSetting.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";

async function _requireActiveSetupAdmin(
  options: Readonly<{ database: DatabaseExecutor; viewer: Viewer }>,
): Promise<void> {
  const { database, viewer } = options;
  const member = await database
    .selectFrom("members")
    .select(["role", "status"])
    .where("id", "=", viewer.memberId)
    .executeTakeFirst();
  if (
    !viewer.isAdmin ||
    member?.role !== "admin" ||
    member.status !== "active"
  ) {
    throw ApiError.forbidden("setup_forbidden");
  }
}

/**
 * Any active admin may clear onboarding once; audit and progress commit
 * together.
 */
export async function completeSetup(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    now: string;
  }>,
): Promise<void> {
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      await _requireActiveSetupAdmin({
        database: transaction,
        viewer: options.viewer,
      });
      const settings = await readInstanceSettings({
        database: transaction,
        keys: ["setup.pending_member_id"],
      });
      const pendingMemberId = settings["setup.pending_member_id"];
      if (pendingMemberId === null) {
        return;
      }
      await saveInstanceSetting({
        transaction,
        key: "setup.pending_member_id",
        value: null,
        memberId: options.viewer.memberId,
        now: options.now,
      });
      await writeActivityEvent({
        transaction,
        viewer: options.viewer,
        kind: "setting_changed",
        subjectKind: "setting",
        subjectId: "setup.pending_member_id",
        subjectLabel: "setup.pending_member_id",
        detail: { fromValue: pendingMemberId, toValue: null },
        now: options.now,
      });
    },
  });
}
