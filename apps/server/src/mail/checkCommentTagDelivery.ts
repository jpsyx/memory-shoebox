import { readEligibleCommentTagMembers } from "../commentTags/readCommentTagCandidates.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { OutboundEmailRow } from "./mailQueue.types.ts";

/** Checks the live tag, preference, profile and item access immediately before sending. */
export async function checkCommentTagDelivery(
  options: Readonly<{ database: DatabaseExecutor; row: OutboundEmailRow }>,
): Promise<boolean> {
  const { database, row } = options;
  if (row.trigger_kind !== "comment" || row.to_member_id === null) {
    return false;
  }
  const current = await database
    .selectFrom("comments")
    .innerJoin("comment_tags", "comment_tags.comment_id", "comments.id")
    .innerJoin("members", "members.id", "comment_tags.member_id")
    .select("comments.item_id as itemId")
    .where("comments.id", "=", row.trigger_id)
    .where("members.id", "=", row.to_member_id)
    .where("members.notify_on_comment_tag", "=", 1)
    .where("comments.author_member_id", "!=", row.to_member_id)
    .executeTakeFirst();
  if (current === undefined) {
    return false;
  }
  const eligible = await readEligibleCommentTagMembers({
    database,
    itemId: current.itemId,
    memberIds: [row.to_member_id],
  });
  return eligible.length === 1;
}
