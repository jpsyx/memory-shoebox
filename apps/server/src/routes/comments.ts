import { reconcileCommentTagEmails } from "../items/reconcileCommentTagEmails.ts";
import { validateCommentTags } from "../commentTags/validateCommentTags.ts";
import {
  readCommentTags,
  replaceCommentTags,
} from "../commentTags/replaceCommentTags.ts";
import { requireCompleteProfile } from "../members/requireCompleteProfile.ts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  commentIdParamsSchema,
  setReactionRequestSchema,
  updateCommentRequestSchema,
  type CommentDto,
  type CommentTag,
  type UpdateCommentRequest,
  type ReactionSummary,
} from "@memory-shoebox/shared";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { createId } from "../db/createId.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer, type Viewer } from "../http/requestContextHelpers.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../items/getVisibleItemOr404.ts";
import { readCommentThread } from "../items/readCommentThread.ts";
import {
  makeEmptyReactionSummary,
  makeReactionSummariesFromRows,
  readCommentReactionRows,
} from "../items/readReactionSummaries.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** One comment, with the item it hangs off already checked. */
type VisibleComment = {
  item: VisibleItem;
  commentId: string;
  itemId: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
  atSeconds: number | null;
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
      "comments.at_seconds as atSeconds",
    ])
    .where("comments.id", "=", options.commentId)
    .executeTakeFirst();

  if (comment === undefined) {
    throw ApiError.notFound("comment_not_found");
  }

  // The item's predicate, checked before anything else and reported as the
  // comment's own 404.
  const item = await getVisibleItemOr404({
    database: options.database,
    viewer: options.viewer,
    itemId: comment.itemId,
    code: "comment_not_found",
  });

  return { ...comment, item };
}

type CommentEditOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  commentId: string;
  body: UpdateCommentRequest;
  now: string;
};

async function _readTagsForEdit(
  options: Readonly<CommentEditOptions>,
): Promise<CommentTag[]> {
  const existingTags =
    (
      await readCommentTags({
        database: options.database,
        commentIds: [options.commentId],
      })
    ).get(options.commentId) ?? [];
  if (options.body.commentTags === undefined && existingTags.length > 0) {
    throw ApiError.conflict({
      code: "comment_tags_reload_required",
      details: {
        fieldErrors: {
          commentTags: ["Reload this comment before editing its tags."],
        },
      },
    });
  }
  return existingTags;
}

async function _writeCommentEdit(
  options: Readonly<CommentEditOptions>,
): Promise<void> {
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const comment = await _getVisibleCommentOr404({
        ...options,
        database: transaction,
      });
      if (comment.authorMemberId !== options.viewer.memberId)
        throw ApiError.forbidden("comment_edit_forbidden");
      const existingTags = await _readTagsForEdit({
        ...options,
        database: transaction,
      });
      const tags = await validateCommentTags({
        database: transaction,
        viewer: options.viewer,
        item: comment.item,
        body: options.body.body,
        commentTags: options.body.commentTags ?? [],
        existingTags,
      });
      await transaction
        .updateTable("comments")
        .set({ body: options.body.body, edited_at: options.now })
        .where("id", "=", options.commentId)
        .execute();
      await replaceCommentTags({
        transaction,
        commentId: options.commentId,
        tags,
      });
      await reconcileCommentTagEmails({
        ...options,
        transaction,
        item: comment.item,
        body: options.body.body,
        atSeconds: comment.atSeconds,
        previousTags: existingTags,
        tags,
        isCreate: false,
      });
    },
  });
}

async function _readUpdatedComment(
  request: FastifyRequest,
  comment: Readonly<VisibleComment>,
  viewer: Viewer,
): Promise<CommentDto> {
  const thread = await readCommentThread({
    database: request.server.database,
    itemId: comment.itemId,
    viewer,
    members: await readMemberRefs({
      database: request.server.database,
      b2: request.server.b2,
      now: request.server.clock().toISOString(),
    }),
  });
  const updated = thread.find((entry) => {
    return entry.commentId === comment.commentId;
  });
  if (updated === undefined) throw ApiError.notFound("comment_not_found");
  return updated;
}

/** `PATCH /comments/:commentId`: edit a comment's own words and explicit ranges. */
async function _patchComment(request: FastifyRequest): Promise<CommentDto> {
  const viewer = requireViewer(request);
  const { commentId } = commentIdParamsSchema.parse(request.params);
  const body = updateCommentRequestSchema.parse(request.body);
  const now = request.server.clock().toISOString();
  const comment = await _getVisibleCommentOr404({
    database: request.server.database,
    viewer,
    commentId,
  });
  requireCompleteProfile(viewer);
  // Admins may delete another person's words but may never edit them.
  if (comment.authorMemberId !== viewer.memberId)
    throw ApiError.forbidden("comment_edit_forbidden");
  await _writeCommentEdit({
    database: request.server.database,
    viewer,
    commentId,
    body,
    now,
  });
  return _readUpdatedComment(request, comment, viewer);
}

/**
 * The moderation log entry for a delete, when it deletes someone else's.
 *
 * An author withdrawing their own writes nothing: that is not moderation,
 * and the log records only what the state tables cannot answer later.
 */
async function _logCommentDeletion(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  comment: VisibleComment;
  now: string;
}): Promise<void> {
  await writeActivityEvent({
    transaction: options.transaction,
    viewer: options.viewer,
    kind: "comment_deleted",
    subjectKind: "comment",
    subjectId: options.comment.commentId,
    subjectLabel: options.comment.body,
    now: options.now,
  });
}

/** Cancels the whole one-level thread before its rows disappear by cascade. */
async function _cancelCommentThreadEmails(
  transaction: DatabaseExecutor,
  commentId: string,
): Promise<void> {
  const deletedComments = await transaction
    .selectFrom("comments")
    .select("id")
    .where((expression) => {
      return expression.or([
        expression("id", "=", commentId),
        expression("parent_comment_id", "=", commentId),
      ]);
    })
    .execute();
  await transaction
    .updateTable("outbound_emails")
    .set({ state: "cancelled" })
    .where("trigger_kind", "=", "comment")
    .where(
      "trigger_id",
      "in",
      deletedComments.map((comment) => {
        return comment.id;
      }),
    )
    .where("state", "=", "queued")
    .execute();
}

/** The moderation log entry and email cancellation a delete costs. */
async function _cascadeCommentDelete(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  comment: VisibleComment;
  isAuthor: boolean;
  now: string;
}): Promise<void> {
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      if (!options.isAuthor) {
        await _logCommentDeletion({
          transaction,
          viewer: options.viewer,
          comment: options.comment,
          now: options.now,
        });
      }

      await _cancelCommentThreadEmails(transaction, options.comment.commentId);

      // `comment_reactions` go with it by CASCADE, which is the delete
      // dialog's own copy and the cascade a polymorphic reactions table
      // would not have given.
      await transaction
        .deleteFrom("comments")
        .where("id", "=", options.comment.commentId)
        .execute();
    },
  });
}

/** `DELETE /comments/:commentId`: withdraw it, or moderate someone else's. */
async function _deleteComment(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
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

  await _cascadeCommentDelete({
    database: request.server.database,
    viewer,
    comment,
    isAuthor,
    now,
  });

  return reply.code(204).send();
}

// The comment's own reaction pair, the same shape as the item's two in
// `items.ts` against `comment_reactions` and its own
// `UNIQUE (comment_id, member_id)`. `readCommentReactionRows` batches over
// `comment_id IN (...)` for a whole thread; a single-element array here is
// the one place in the codebase where that per-comment call is correct,
// because there is exactly one comment to report back to the caller who
// just reacted to it.

/** `PUT /comments/:commentId/reaction`: set or replace the viewer's own. */
async function _putCommentReaction(
  request: FastifyRequest,
): Promise<ReactionSummary> {
  const viewer = requireViewer(request);
  const { commentId } = commentIdParamsSchema.parse(request.params);
  const { kind } = setReactionRequestSchema.parse(request.body);
  const now = request.server.clock().toISOString();

  const comment = await _getVisibleCommentOr404({
    database: request.server.database,
    viewer,
    commentId,
  });

  await request.server.database
    .insertInto("comment_reactions")
    .values({
      id: createId(),
      comment_id: comment.commentId,
      member_id: viewer.memberId,
      kind,
      created_at: now,
    })
    .onConflict((conflict) => {
      // `created_at` is deliberately not touched, so the moment somebody
      // first said something stands and the order inside a kind stays
      // stable when they change their mind.
      return conflict
        .columns(["comment_id", "member_id"])
        .doUpdateSet({ kind });
    })
    .execute();

  return (
    makeReactionSummariesFromRows({
      rows: await readCommentReactionRows({
        database: request.server.database,
        commentIds: [comment.commentId],
      }),
      members: await readMemberRefs({
        database: request.server.database,
        b2: request.server.b2,
        now: request.server.clock().toISOString(),
      }),
      viewerMemberId: viewer.memberId,
    }).get(comment.commentId) ?? makeEmptyReactionSummary()
  );
}

/** `DELETE /comments/:commentId/reaction`: clear the viewer's own. */
async function _deleteCommentReaction(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { commentId } = commentIdParamsSchema.parse(request.params);

  const comment = await _getVisibleCommentOr404({
    database: request.server.database,
    viewer,
    commentId,
  });

  // Unreacting when there is no reaction is a 204, not a 404: the route
  // is idempotent and the outcome the caller asked for holds either way.
  // The 404 is always about the comment (through its item), never about
  // the reaction.
  await request.server.database
    .deleteFrom("comment_reactions")
    .where("comment_id", "=", comment.commentId)
    .where("member_id", "=", viewer.memberId)
    .execute();

  return reply.code(204).send();
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
    _patchComment,
  );

  app.delete(
    "/comments/:commentId",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    _deleteComment,
  );

  app.put(
    "/comments/:commentId/reaction",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    _putCommentReaction,
  );

  app.delete(
    "/comments/:commentId/reaction",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    _deleteCommentReaction,
  );
}
