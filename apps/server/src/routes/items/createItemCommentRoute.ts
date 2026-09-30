import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createCommentRequestSchema,
  itemIdParamsSchema,
  type CommentDto,
} from "@memory-shoebox/shared";
import { readMemberRefs } from "../../archive/readMemberRefs.ts";
import { createId } from "../../db/createId.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { enqueueCommentEmails } from "../../items/enqueueCommentEmails.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../../items/getVisibleItemOr404.ts";
import { makeEmptyReactionSummary } from "../../items/readReactionSummaries.ts";

/**
 * Where in a video the comment stands, or a 400.
 *
 * Clamped at the top rather than rejected: `fraction * duration` with
 * `fraction === 1` produces exactly the duration, and a float a hair over it
 * is arithmetic rather than a bad request. Below zero is impossible from the
 * scrubber, and a pin on a photograph is a 400 because the photo viewer has
 * no transport to stand on.
 */
function _getAtSecondsForItem(options: {
  atSeconds: number | null | undefined;
  item: VisibleItem;
}): number | null {
  const { atSeconds } = options;
  if (atSeconds === null || atSeconds === undefined) {
    return null;
  }
  if (options.item.kind === "photo") {
    throw ApiError.invalidRequest({
      atSeconds: ["A photograph has no transport to pin a comment to."],
    });
  }
  return Math.min(atSeconds, (options.item.durationMs ?? 0) / 1000);
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
  const atSeconds = _getAtSecondsForItem({
    atSeconds: body.atSeconds,
    item,
  });

  const commentId = createId();
  await runInImmediateTransaction({
    database: request.server.database,
    callback: async (transaction) => {
      await transaction
        .insertInto("comments")
        .values({
          id: commentId,
          item_id: item.itemId,
          author_member_id: viewer.memberId,
          body: body.body,
          at_seconds: atSeconds,
          created_at: now,
          edited_at: null,
        })
        .execute();

      // Inside the same transaction: a message is never queued for a
      // comment that did not land, and the comment never lands without
      // its message.
      await enqueueCommentEmails({
        transaction,
        viewer,
        item,
        commentId,
        body: body.body,
        atSeconds,
        now,
      });
    },
  });

  void reply.code(201);
  return {
    commentId,
    author: (await readMemberRefs(request.server.database)).get(
      viewer.memberId,
    ) ?? { memberId: viewer.memberId, displayName: "" },
    body: body.body,
    atSeconds,
    createdAt: now,
    editedAt: null,
    canEdit: true,
    canDelete: true,
    reactions: makeEmptyReactionSummary(),
  };
}
