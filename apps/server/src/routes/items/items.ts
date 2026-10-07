import type { FastifyInstance } from "fastify";
import { postItemComment } from "./createItemCommentRoute.ts";
import { deleteItem } from "./deleteItemRoute.ts";
import {
  patchItem,
  putItemPeople,
  putItemTags,
} from "./editItemContentRoutes.ts";
import { postItemCaptureDate } from "./itemCaptureDateRoute.ts";
import { deleteItemReaction, putItemReaction } from "./itemReactionRoutes.ts";
import { postItemsSeen } from "./itemsSeenRoute.ts";
import {
  patchItemVisibility,
  postItemsVisibility,
} from "./itemVisibilityRoutes.ts";
import { getItem, getItemOriginal } from "./readItemRoutes.ts";
import {
  deleteItemVideoReaction,
  getItemVideoReactions,
  putItemVideoReaction,
} from "./videoReactionRoutes.ts";

/**
 * The item slice's routes: `tech-specs/apis/items.md`.
 *
 * Wiring and nothing else. Every handler is a named function in this
 * directory, grouped the way the contract groups the routes: the two reads,
 * the three edits the role gate alone covers, the two visibility routes, the
 * delete, the capture date, the comment, the reaction pair, and the batch
 * seen latch. Each file carries the reasoning for the routes in it.
 *
 * `POST /api/items/seen` is the one crossing: it is the archive's seen latch,
 * and it is served from here because the path it sits under is an item's.
 */
export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/items/:itemId", getItem);

  app.get("/items/:itemId/original", getItemOriginal);

  app.get("/items/:itemId/video-reactions", getItemVideoReactions);

  app.put(
    "/items/:itemId/video-reactions/:reactionId",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    putItemVideoReaction,
  );

  app.delete(
    "/items/:itemId/video-reactions/:reactionId",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    deleteItemVideoReaction,
  );

  app.patch("/items/:itemId", patchItem);

  app.put("/items/:itemId/tags", putItemTags);

  app.put("/items/:itemId/people", putItemPeople);

  app.patch("/items/:itemId/visibility", patchItemVisibility);

  app.delete("/items/:itemId", deleteItem);

  app.post("/items/:itemId/capture-date", postItemCaptureDate);

  app.post(
    "/items/:itemId/comments",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    postItemComment,
  );

  app.put(
    "/items/:itemId/reaction",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    putItemReaction,
  );

  app.delete(
    "/items/:itemId/reaction",
    { config: { rateLimit: ["conversationWritePerMember"] } },
    deleteItemReaction,
  );

  app.post("/items/seen", postItemsSeen);

  app.post("/items/visibility", postItemsVisibility);
}
