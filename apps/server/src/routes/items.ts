import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  itemsSeenRequestSchema,
  type ItemDetail,
} from "@memory-shoebox/shared";
import { latchItemsSeen } from "../archive/latchItemsSeen.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../items/getVisibleItemOr404.ts";
import { latchItemOpened } from "../items/latchItemOpened.ts";
import { readItemDetail } from "../items/readItemDetail.ts";

/**
 * The item slice's routes: `tech-specs/apis/items.md`.
 *
 * `GET /api/items/:itemId` is the permalink, and the latch that clears the
 * pile's accent dot lives here too, from step 4a.
 *
 * **`204`, no body, and no per-id feedback of any kind** on the seen latch.
 * There is genuinely nothing to return, and a shape that reported anything
 * would be a visibility oracle: post one id, read the number back, learn
 * whether a photograph exists that you are not allowed to see.
 */
export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/items/:itemId",
    async (request: FastifyRequest): Promise<ItemDetail> => {
      const viewer = requireViewer(request);
      const { itemId } = itemIdParamsSchema.parse(request.params);
      const now = request.server.clock();

      const item = await getVisibleItemOr404({
        database: request.server.database,
        viewer,
        itemId,
      });

      const detail = await readItemDetail({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        item,
        now,
      });

      // Both latches run after the reads are assembled and outside the read
      // work, so a page of reads never holds SQLite's single writer, and
      // `isUnseen` above reports the state the viewer arrived in.
      await latchItemOpened({
        database: request.server.database,
        memberId: viewer.memberId,
        itemId: item.itemId,
        now: now.toISOString(),
      });

      if (item.burstId !== null) {
        // `first_seen_at` for every visible sibling, in one batched
        // statement (`items.md` Ruling 6). A thumbnail in the strip has been
        // in front of the viewer; it was not opened at full size.
        await latchItemsSeen({
          database: request.server.database,
          viewer,
          itemIds: [],
          burstIds: [item.burstId],
          now: now.toISOString(),
        });
      }

      return detail;
    },
  );

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
