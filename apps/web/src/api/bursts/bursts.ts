import {
  burstFramesResponseSchema,
  type BurstFramesResponse,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/clientHelpers/clientHelpers";

/**
 * The exact path a burst's frames are asked for at.
 *
 * Cite this path and not `/api/bursts/:burstId/items`, which is the guess
 * `items.md` § `GET /api/bursts/:burstId/frames` exists to correct.
 */
export function makeFramesPathFromBurstId(burstId: string): string {
  return `/bursts/${encodeURIComponent(burstId)}/frames`;
}

/**
 * One burst's visible frames, fetched when somebody presses the stack or when
 * the item viewer's strip needs more than the sixty `ItemDetail` carries.
 *
 * `BurstFrameRef[]`, as `items.md` § `GET /api/bursts/:burstId/frames` fixes
 * it: an id, a dense position, a thumb and an alt text, and nothing that would
 * let a gap in the stored order count what the viewer cannot see. The route
 * latches `first_seen_at` for the burst itself.
 */
export function burstFramesQueryOptions(
  burstId: string,
): ReturnType<
  typeof queryOptions<BurstFramesResponse, Error, BurstFramesResponse, string[]>
> {
  return queryOptions({
    queryKey: ["bursts", burstId, "frames"],
    queryFn: (): Promise<BurstFramesResponse> => {
      return apiFetch({
        path: makeFramesPathFromBurstId(burstId),
        schema: burstFramesResponseSchema,
      });
    },
    // Frames do not change while somebody looks at a fan, and a collapse
    // followed by a re-open should not cost a second request.
    staleTime: 5 * 60 * 1000,
  });
}
