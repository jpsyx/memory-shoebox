import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  commentIdParamsSchema,
  updateCommentRequestSchema,
  type CommentDto,
} from "@memory-shoebox/shared";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer, type Viewer } from "../http/requestContextHelpers.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent.ts";
import { getVisibleItemOr404 } from "../items/getVisibleItemOr404.ts";
import { readCommentThread } from "../items/readCommentThread.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** One comment, with the item it hangs off already checked. */
type VisibleComment = {
  commentId: string;
  itemId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
};

/**
 * Resolves a comment through its item's visibility, or refuses the request.
 *
 * **The code names the resource the caller addressed.** A comment on an item
 * the viewer may not see is `comment_not_found`, never `403` and never
 * `item_not_found`: comments have no visibility of their own and inherit their
 * item's rule exactly.
 */
async function _getVisibleCommentOr404(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  commentId: string;
}): Promise<VisibleComment> {
  const comment = await options.database
    .selectFrom("comments")
    .select([
      "comments.id as commentId",
      "comments.item_id as itemId",
      "comments.author_member_id as authorMemberId",
      "comments.body as body",
      "comments.created_at as createdAt",
    ])
    .where("comments.id", "=", options.commentId)
    .executeTakeFirst();

  if (comment === undefined) {
    throw ApiError.notFound("comment_not_found");
  }

  // The item's predicate, checked before anything else and reported as the
  // comment's own 404.
  await getVisibleItemOr404({
    database: options.database,
    viewer: options.viewer,
    itemId: comment.itemId,
    code: "comment_not_found",
  });

  return comment;
}

/**
 * Comments: `tech-specs/apis/items.md` § Comments.
 *
 * Every route addresses a comment by its own id and reaches the item through
 * `comments.item_id`. Creating one is item-scoped and lives in `items.ts`.
 */
export async function commentsRoutes(app: FastifyInstance): Promise<void> {
  app.patch(
    "/comments/:commentId",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    async (request: FastifyRequest): Promise<CommentDto> => {
      const viewer = requireViewer(request);
      const { commentId } = commentIdParamsSchema.parse(request.params);
      const body = updateCommentRequestSchema.parse(request.body);
      const now = request.server.clock().toISOString();

      const comment = await _getVisibleCommentOr404({
        database: request.server.database,
        viewer,
        commentId,
      });

      if (comment.authorMemberId !== viewer.memberId) {
        // An admin gets this too: Decision 8 grants admins "delete anything",
        // not edit anything. Nobody edits another person's words.
        throw ApiError.forbidden("comment_edit_forbidden");
      }

      await request.server.database
        .updateTable("comments")
        .set({ body: body.body, edited_at: now })
        .where("id", "=", commentId)
        .execute();

      const thread = await readCommentThread({
        database: request.server.database,
        itemId: comment.itemId,
        viewer,
        members: await readMemberRefs(request.server.database),
      });
      const updated = thread.find((entry) => {
        return entry.commentId === commentId;
      });
      if (updated === undefined) {
        throw ApiError.notFound("comment_not_found");
      }
      return updated;
    },
  );

  app.delete(
    "/comments/:commentId",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const viewer = requireViewer(request);
      const { commentId } = commentIdParamsSchema.parse(request.params);
      const now = request.server.clock().toISOString();

      const comment = await _getVisibleCommentOr404({
        database: request.server.database,
        viewer,
        commentId,
      });

      const isAuthor = comment.authorMemberId === viewer.memberId;
      if (!isAuthor && !viewer.isAdmin) {
        throw ApiError.forbidden("comment_delete_forbidden");
      }

      await runInImmediateTransaction({
        database: request.server.database,
        callback: async (transaction) => {
          if (!isAuthor) {
            // A moderation act, and the only record of what was said. An
            // author withdrawing their own writes nothing: that is not
            // moderation, and the log records only what the state tables
            // cannot answer later.
            await writeActivityEvent({
              transaction,
              viewer,
              kind: "comment_deleted",
              subjectKind: "comment",
              subjectId: commentId,
              subjectLabel: comment.body,
              now,
            });
          }

          // So a message does not arrive quoting something that no longer
          // exists at a link that no longer shows it. A row already `sending`
          // or `sent` is left alone: it cannot be recalled, and cancelling it
          // would make the delivered-or-not boundary a race.
          await transaction
            .updateTable("outbound_emails")
            .set({ state: "cancelled" })
            .where("trigger_kind", "=", "comment")
            .where("trigger_id", "=", commentId)
            .where("state", "=", "queued")
            .execute();

          // `comment_reactions` go with it by CASCADE, which is the delete
          // dialog's own copy and the cascade a polymorphic reactions table
          // would not have given.
          await transaction
            .deleteFrom("comments")
            .where("id", "=", commentId)
            .execute();
        },
      });

      return reply.code(204).send();
    },
  );
}
