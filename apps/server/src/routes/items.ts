import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { itemsSeenRequestSchema } from "@memory-shoebox/shared";
import { latchItemsSeen } from "../archive/latchItemsSeen.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";

/**
 * One item and the latch that clears its accent dot:
 * `tech-specs/apis/timeline.md`.
 *
 * Only the latch lives here today. The rest of the item slice, which is
 * `GET /api/items/:itemId` and everything hanging off one photograph, belongs
 * to a later step and lands in this module.
 *
 * **`204`, no body, and no per-id feedback of any kind.** There is genuinely
 * nothing to return, and a shape that reported anything would be a visibility
 * oracle: post one id, read the number back, learn whether a photograph exists
 * that you are not allowed to see.
 */
export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/items/seen",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const viewer = requireViewer(request);
      const body = itemsSeenRequestSchema.parse(request.body);

      await latchItemsSeen({
        database: request.server.database,
        viewer,
        itemIds: body.itemIds,
        burstIds: body.burstIds,
        now: request.server.clock().toISOString(),
      });

      return reply.code(204).send();
    },
  );
}
