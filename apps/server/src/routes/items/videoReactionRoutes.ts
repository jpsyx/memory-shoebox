import type { FastifyReply, FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  putVideoReactionRequestSchema,
  videoReactionParamsSchema,
  type VideoReaction,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import {
  getVideoMomentFromItem,
  makeVideoReactionsFromRows,
  putVideoReaction,
} from "../../items/videoReactionHelpers.ts";

/** `GET /items/:itemId/video-reactions`: the newest fifty visible gestures. */
export async function getItemVideoReactions(
  request: FastifyRequest,
): Promise<VideoReaction[]> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const database = request.server.database;
  await getVisibleItemOr404({ database, viewer, itemId });
  const rows = await database
    .selectFrom("video_reactions")
    .selectAll()
    .where("item_id", "=", itemId)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(50)
    .execute();
  return makeVideoReactionsFromRows({ database, viewer, rows });
}

/** `PUT /items/:itemId/video-reactions/:reactionId`: save or retry one event. */
export async function putItemVideoReaction(
  request: FastifyRequest,
): Promise<VideoReaction> {
  const viewer = requireViewer(request);
  const { itemId, reactionId } = videoReactionParamsSchema.parse(
    request.params,
  );
  const rows = await runInImmediateTransaction({
    database: request.server.database,
    callback: async (database) => {
      const item = await getVisibleItemOr404({ database, viewer, itemId });
      const body = putVideoReactionRequestSchema.parse(request.body);
      const event = await putVideoReaction({
        database,
        event: {
          id: reactionId,
          item_id: itemId,
          member_id: viewer.memberId,
          emoji: body.emoji,
          at_seconds: getVideoMomentFromItem({
            item,
            atSeconds: body.atSeconds,
          }),
          created_at: request.server.clock().toISOString(),
        },
      });
      return makeVideoReactionsFromRows({ database, viewer, rows: [event] });
    },
  });
  const event = rows[0];
  if (event === undefined) {
    throw new Error("A saved video reaction must have a response.");
  }
  return event;
}

/** `DELETE /items/:itemId/video-reactions/:reactionId`: own or admin removal. */
export async function deleteItemVideoReaction(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { itemId, reactionId } = videoReactionParamsSchema.parse(
    request.params,
  );
  await runInImmediateTransaction({
    database: request.server.database,
    callback: async (database) => {
      const item = await getVisibleItemOr404({ database, viewer, itemId });
      getVideoMomentFromItem({ item, atSeconds: 0 });
      const event = await database
        .selectFrom("video_reactions")
        .select("member_id")
        .where("id", "=", reactionId)
        .where("item_id", "=", itemId)
        .executeTakeFirst();
      if (
        event !== undefined &&
        event.member_id !== viewer.memberId &&
        !viewer.isAdmin
      ) {
        throw ApiError.forbidden("video_reaction_delete_forbidden");
      }
      await database
        .deleteFrom("video_reactions")
        .where("id", "=", reactionId)
        .where("item_id", "=", itemId)
        .execute();
    },
  });
  return reply.code(204).send();
}
