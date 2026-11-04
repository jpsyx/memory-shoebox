import type {
  NotifyPreferences,
  ActivityNotificationCategory,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** Discards unscheduled summaries when a member leaves Daily, in the save transaction. */
export async function cancelPendingDigestPreferences(
  options: Readonly<{
    executor: DatabaseExecutor;
    memberId: string;
    notify: NotifyPreferences;
  }>,
): Promise<void> {
  const categories: ActivityNotificationCategory[] = [];
  if (options.notify.onUpload !== "daily") {
    categories.push("upload");
  }
  if (options.notify.onComment !== "daily") {
    categories.push("comment");
  }
  if (options.notify.onCommentTag !== "daily") {
    categories.push("comment_tag");
  }
  if (categories.length === 0) {
    return;
  }
  await options.executor
    .updateTable("notification_digest_events")
    .set({ state: "cancelled" })
    .where("member_id", "=", options.memberId)
    .where("state", "=", "pending")
    .where("category", "in", categories)
    .execute();
}
