import type { CommentDto, MemberRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeEmptyReactionSummary,
  makeReactionSummariesFromRows,
  readCommentReactionRows,
} from "./readReactionSummaries.ts";

/**
 * One item's whole thread, oldest first, with its reactions.
 *
 * **Unpaginated, deliberately.** A family photograph carries tens of
 * comments, not thousands (`items.md` § `GET /api/items/:itemId`
 * transformation 10). If that ever stops being true the fix is a
 * `GET /api/items/:itemId/comments` collection, not a cursor bolted onto
 * `ItemDetail`.
 *
 * **Two queries whatever the thread's size**: the comments on
 * `comments (item_id, created_at)`, then every reaction on all of them in one
 * `comment_id IN (...)` through `readCommentReactionRows`. One query per
 * comment is the N+1 the data model calls out by name.
 *
 * `canEdit` is authorship alone and `canDelete` is authorship or admin
 * (Decision 8): an admin may delete anybody's words and may edit nobody's.
 *
 * @param options.database The Kysely handle.
 * @param options.itemId The item whose thread this is.
 * @param options.viewer The request's viewer, for `canEdit` and `myKind`.
 * @param options.members The per-request member map.
 */
export async function readCommentThread(options: {
  database: DatabaseExecutor;
  itemId: string;
  viewer: Viewer;
  members: ReadonlyMap<string, MemberRef>;
}): Promise<CommentDto[]> {
  const rows = await options.database
    .selectFrom("comments")
    .select([
      "comments.id as commentId",
      "comments.author_member_id as authorMemberId",
      "comments.body as body",
      "comments.at_seconds as atSeconds",
      "comments.created_at as createdAt",
      "comments.edited_at as editedAt",
    ])
    .where("comments.item_id", "=", options.itemId)
    .orderBy("comments.created_at", "asc")
    .orderBy("comments.id", "asc")
    .execute();

  const reactions = makeReactionSummariesFromRows({
    rows: await readCommentReactionRows({
      database: options.database,
      commentIds: rows.map((row) => {
        return row.commentId;
      }),
    }),
    members: options.members,
    viewerMemberId: options.viewer.memberId,
  });

  return rows.map((row) => {
    const isAuthor = row.authorMemberId === options.viewer.memberId;
    return {
      commentId: row.commentId,
      author: options.members.get(row.authorMemberId) ?? {
        memberId: row.authorMemberId,
        displayName: "",
      },
      body: row.body,
      atSeconds: row.atSeconds,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      canEdit: isAuthor,
      canDelete: isAuthor || options.viewer.isAdmin,
      reactions: reactions.get(row.commentId) ?? makeEmptyReactionSummary(),
    };
  });
}
