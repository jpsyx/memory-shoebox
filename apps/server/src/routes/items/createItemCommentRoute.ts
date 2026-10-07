import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createCommentRequestSchema,
  itemIdParamsSchema,
  type CommentDto,
  type CreateCommentRequest,
} from "@memory-shoebox/shared";
import { readMemberRefs } from "../../archive/readMemberRefs.ts";
import { createId } from "../../db/createId.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import {
  requireViewer,
  type Viewer,
} from "../../http/requestContextHelpers.ts";
import { enqueueCommentEmails } from "../../items/enqueueCommentEmails.ts";
import {
  getCommentAnchorFromRequest,
  type CommentAnchor,
} from "../../items/getCommentAnchorFromRequest.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../../items/getVisibleItemOr404.ts";
import { makeEmptyReactionSummary } from "../../items/readReactionSummaries.ts";

/**
 * The row and its notifications, in one transaction.
 *
 * Together on purpose: a message is never queued for a comment that did not
 * land, and the comment never lands without its message.
 */
async function _writeCommentAndQueueItsMail(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  commentId: string;
  request: CreateCommentRequest;
  now: string;
}): Promise<CommentAnchor> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const anchor = await getCommentAnchorFromRequest({
        database: transaction,
        item: options.item,
        request: options.request,
      });
      await transaction
        .insertInto("comments")
        .values({
          id: options.commentId,
          item_id: options.item.itemId,
          author_member_id: options.viewer.memberId,
          body: options.request.body,
          at_seconds: anchor.atSeconds,
          parent_comment_id: anchor.parentCommentId,
          created_at: options.now,
          edited_at: null,
        })
        .execute();

      await enqueueCommentEmails({
        transaction,
        viewer: options.viewer,
        item: options.item,
        commentId: options.commentId,
        body: options.request.body,
        atSeconds: anchor.atSeconds,
        now: options.now,
      });
      return anchor;
    },
  });
}

/**
 * The comment as its own author sees it, straight after writing it.
 *
 * `canEdit` and `canDelete` are both true without a lookup: this member wrote
 * it a moment ago, and there are no reactions on a comment that has existed
 * for one statement.
 */
async function _makeCommentDtoForAuthor(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  commentId: string;
  body: string;
  atSeconds: number | null;
  parentCommentId: string | null;
  now: string;
}): Promise<CommentDto> {
  const members = await readMemberRefs(options.database);
  return {
    commentId: options.commentId,
    author: members.get(options.viewer.memberId) ?? {
      memberId: options.viewer.memberId,
      displayName: "",
    },
    body: options.body,
    atSeconds: options.atSeconds,
    parentCommentId: options.parentCommentId,
    createdAt: options.now,
    editedAt: null,
    canEdit: true,
    canDelete: true,
    reactions: makeEmptyReactionSummary(),
  };
}

/**
 * `POST /items/:itemId/comments`: say something, optionally pinned to a
 * moment in a video.
 *
 * **Not role-gated.** Holding the payload is the permission: everybody who
 * can open an item can comment on it (`PRODUCT.md` § Visibility), a
 * `viewer` included. Only `getVisibleItemOr404` stands between a request
 * and a write.
 */
export async function postItemComment(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<CommentDto> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const body = createCommentRequestSchema.parse(request.body);
  const now = request.server.clock().toISOString();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  const commentId = createId();
  const anchor = await _writeCommentAndQueueItsMail({
    database: request.server.database,
    viewer,
    item,
    commentId,
    request: body,
    now,
  });

  void reply.code(201);
  return _makeCommentDtoForAuthor({
    database: request.server.database,
    viewer,
    commentId,
    body: body.body,
    ...anchor,
    now,
  });
}
