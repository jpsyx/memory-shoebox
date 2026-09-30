import type { FastifyReply, FastifyRequest } from "fastify";
import { itemsSeenRequestSchema } from "@memory-shoebox/shared";
import { latchItemsSeen } from "../../archive/latchItemsSeen.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";

/**
 * `POST /items/seen`: the batch latch for everything that has been on screen.
 *
 * **`204`, no body, and no per-id feedback of any kind.** There is genuinely
 * nothing to return, and a shape that reported anything would be a visibility
 * oracle: post one id, read the number back, learn whether a photograph exists
 * that you are not allowed to see.
 */
export async function postItemsSeen(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
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
}
