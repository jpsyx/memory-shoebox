import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  burstFramesRequestSchema,
  burstIdParamsSchema,
  type BurstFramesResponse,
} from "@memory-shoebox/shared";
import { latchItemsSeen } from "../archive/latchItemsSeen.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import {
  getPageStateFromBurstFrameCursor,
  type BurstFramePageState,
} from "../items/burstFrameCursorHelpers.ts";
import { readBurstFramePage } from "../items/readBurstFrameRefs/readBurstFrameRefs.ts";

/**
 * Decodes the cursor, or refuses the request.
 *
 * `400 invalid_request` with `details.fieldErrors.cursor`, exactly as the
 * timeline's bad cursor is. The cursor is opaque, so a client holding one this
 * route did not issue has nothing to correct by guessing at its contents.
 *
 * @param cursor The `cursor` query parameter, if the caller sent one.
 */
function _getPageStateFromCursor(
  cursor: string | undefined,
): BurstFramePageState | undefined {
  if (cursor === undefined) {
    return undefined;
  }

  const state = getPageStateFromBurstFrameCursor(cursor);
  if (state === undefined) {
    throw ApiError.invalidRequest({
      cursor: ["This is not a cursor this route issued."],
    });
  }
  return state;
}

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
 *
 * **The cursor is real.** It is opaque and encodes `(burst_index, id)`, the
 * sort key, which is one of only two cursors in the contract that does not
 * encode a bare uuidv7: `burst_index` is the order the strip is read in and
 * does not have to agree with arrival order. A burst longer than `limit`
 * therefore pages instead of being truncated and reported complete.
 */
export async function burstsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/bursts/:burstId/frames",
    async (request: FastifyRequest): Promise<BurstFramesResponse> => {
      const viewer = requireViewer(request);
      const { burstId } = burstIdParamsSchema.parse(request.params);
      const { limit, cursor } = burstFramesRequestSchema.parse(request.query);
      const now = request.server.clock();

      const page = await readBurstFramePage({
        database: request.server.database,
        b2: request.server.b2,
        viewer,
        burstId,
        now,
        limit,
        cursor: _getPageStateFromCursor(cursor),
      });

      // On **rows**, not on drawn frames: a page whose frames were all lost to
      // missing renditions is an ingest defect and not a missing burst. A
      // client following `nextCursor` never reaches this, because a cursor is
      // issued only when another visible sibling is known to follow.
      if (page.rowCount === 0) {
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

      // Usually null, because at realistic burst sizes one page carries the
      // whole burst. It is not null by construction: the cursor resumes
      // strictly after `(burst_index, id)`, and `position` numbers straight
      // through the pages rather than restarting at 1 on each.
      return { frames: page.frames, nextCursor: page.nextCursor };
    },
  );
}
