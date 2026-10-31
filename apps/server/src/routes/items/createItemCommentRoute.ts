import { validateCommentTags } from "../../commentTags/validateCommentTags.ts";
import { replaceCommentTags } from "../../commentTags/replaceCommentTags.ts";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";
import { requireCompleteProfile } from "../../members/requireCompleteProfile.ts";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createCommentRequestSchema,
  itemIdParamsSchema,
  type CommentDto,
  type CommentTag,
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

type WriteCommentOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  commentId: string;
  request: CreateCommentRequest;
  now: string;
};

async function _insertCommentAndQueueMail(
  options: Readonly<
    WriteCommentOptions & {
      transaction: DatabaseExecutor;
      anchor: CommentAnchor;
      commentTags: CommentTag[];
    }
  >,
): Promise<void> {
  const { transaction, anchor, commentTags } = options;
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
  await replaceCommentTags({
    transaction,
    commentId: options.commentId,
    tags: commentTags,
  });
  await enqueueCommentEmails({
    transaction,
    viewer: options.viewer,
    item: options.item,
    commentId: options.commentId,
    body: options.request.body,
    atSeconds: anchor.atSeconds,
    now: options.now,
  });
}

/** Validates and writes the comment, occurrences and ordinary mail under one write lock. */
async function _writeCommentAndQueueItsMail(
  options: Readonly<WriteCommentOptions>,
): Promise<CommentAnchor & { commentTags: CommentTag[] }> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const item = await getVisibleItemOr404({
        database: transaction,
        viewer: options.viewer,
        itemId: options.item.itemId,
      });
      const commentTags = await validateCommentTags({
        database: transaction,
        viewer: options.viewer,
        item,
        body: options.request.body,
        commentTags: options.request.commentTags,
        existingTags: [],
      });
      const anchor = await getCommentAnchorFromRequest({
        database: transaction,
        item,
        request: options.request,
      });
      await _insertCommentAndQueueMail({
        ...options,
        item,
        transaction,
        anchor,
        commentTags,
      });
      return { ...anchor, commentTags };
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
  b2: B2Client;
  viewer: Viewer;
  commentId: string;
  body: string;
  commentTags: CommentTag[];
  atSeconds: number | null;
  parentCommentId: string | null;
  now: string;
}): Promise<CommentDto> {
  const members = await readMemberRefs({
    database: options.database,
    b2: options.b2,
    now: options.now,
  });
  return {
    commentId: options.commentId,
    author: members.get(options.viewer.memberId) ?? {
      memberId: options.viewer.memberId,
      displayName: "",
      avatar: null,
    },
    body: options.body,
    commentTags: options.commentTags,
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
 * **Not role-gated.** Every member with a complete profile who can open an
 * item can comment on it (`PRODUCT.md` § Visibility), a `viewer` included.
 * `getVisibleItemOr404` checks access before profile completion is required.
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
  requireCompleteProfile(viewer);
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
    b2: request.server.b2,
    viewer,
    commentId,
    body: body.body,
    ...anchor,
    now,
  });
}
