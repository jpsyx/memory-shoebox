import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  burstFramesRequestSchema,
  burstIdParamsSchema,
  type BurstFramesResponse,
} from "@memory-shoebox/shared";
import { latchItemsSeen } from "../archive/latchItemsSeen.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readBurstFrameRefs } from "../items/readBurstFrameRefs.ts";

/**
 * A burst, fanned into its frames: `tech-specs/apis/items.md` § Bursts.
 *
 * **The predicate applies to the frames, not to the burst.** A burst with no
 * visible frames "vanishes and contributes nothing to the day", so it is a
 * `404` and never an empty list, and that 404 is byte-identical to the one for
 * a burst id that never existed: both are the same `ApiError.notFound`, with
 * no `details`, and the 404 is thrown before anything is latched, so a probe
 * against a burst the viewer cannot see writes nothing.
 *
 * No `BurstSummary` rides along, deliberately: every caller already holds one,
 * from the print it fanned open or from `ItemDetail.burst`.
 */
export async function burstsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/bursts/:burstId/frames",
    async (request: FastifyRequest): Promise<BurstFramesResponse> => {
      const viewer = requireViewer(request);
      const { burstId } = burstIdParamsSchema.parse(request.params);
      const { limit } = burstFramesRequestSchema.parse(request.query);
      const now = request.server.clock();

      const frames = await readBurstFrameRefs({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        burstId,
        now,
        limit,
      });

      if (frames.length === 0) {
        throw ApiError.notFound("burst_not_found");
      }

      // The frames have been in front of the viewer, so the accent dot goes
      // out (`items.md` Ruling 6). One batched statement, and never an open.
      await latchItemsSeen({
        database: request.server.database,
        viewer,
        itemIds: [],
        burstIds: [burstId],
        now: now.toISOString(),
      });

      // Always null: at realistic burst sizes one page is always enough, and
      // the cursor exists so that stops being an assumption in the contract.
      return { frames, nextCursor: null };
    },
  );
}
