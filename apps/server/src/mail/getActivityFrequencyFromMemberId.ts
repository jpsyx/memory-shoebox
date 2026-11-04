import type { NotificationFrequency } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Reads current activity frequency; inactive or missing recipients receive none. */
export async function getActivityFrequencyFromMemberId(
  options: Readonly<{
    executor: DatabaseExecutor;
    memberId: string | null | undefined;
    kind: "upload_session" | "comment" | "comment_tag";
  }>,
): Promise<NotificationFrequency> {
  if (options.memberId == null) {
    return "off";
  }
  const member = await options.executor
    .selectFrom("members")
    .select([
      "status",
      "notify_upload_frequency",
      "notify_comment_frequency",
      "notify_comment_tag_frequency",
    ])
    .where("id", "=", options.memberId)
    .executeTakeFirst();
  if (!member || member.status !== "active") {
    return "off";
  }
  return options.kind === "upload_session"
    ? member.notify_upload_frequency
    : options.kind === "comment"
      ? member.notify_comment_frequency
      : member.notify_comment_tag_frequency;
}
