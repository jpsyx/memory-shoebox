import type { CommentTag } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Replaces one comment's occurrences in the caller's immediate write transaction. */
export async function replaceCommentTags(
  options: Readonly<{
    transaction: DatabaseExecutor;
    commentId: string;
    tags: readonly CommentTag[];
  }>,
): Promise<void> {
  await options.transaction
    .deleteFrom("comment_tags")
    .where("comment_id", "=", options.commentId)
    .execute();
  if (options.tags.length === 0) return;
  await options.transaction
    .insertInto("comment_tags")
    .values(
      options.tags.map((tag) => {
        return {
          id: tag.tagId,
          comment_id: options.commentId,
          member_id: tag.memberId,
          start_offset: tag.start,
          end_offset: tag.end,
          label_snapshot: tag.label,
        };
      }),
    )
    .execute();
}

/** Batch-reads persisted snapshots for an entire thread, including ineligible historical accounts. */
export async function readCommentTags(
  options: Readonly<{
    database: DatabaseExecutor;
    commentIds: readonly string[];
  }>,
): Promise<Map<string, CommentTag[]>> {
  const tags = new Map<string, CommentTag[]>();
  if (options.commentIds.length === 0) return tags;
  const rows = await options.database
    .selectFrom("comment_tags")
    .select([
      "comment_id as commentId",
      "id as tagId",
      "member_id as memberId",
      "start_offset as start",
      "end_offset as end",
      "label_snapshot as label",
    ])
    .where("comment_id", "in", options.commentIds)
    .orderBy("start_offset", "asc")
    .execute();
  for (const { commentId, ...tag } of rows) {
    const occurrences = tags.get(commentId) ?? [];
    occurrences.push(tag);
    tags.set(commentId, occurrences);
  }
  return tags;
}
