import {
  collectionSchema,
  itemSummarySchema,
  type ItemSummary,
} from "@memory-shoebox/shared";
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/api/client/client";

/**
 * A burst's frames, for the fan.
 *
 * **This route belongs to step 5a and is not merged yet.** Its shape is fixed
 * by `timeline.md` Ruling 2: `ItemSummary[]` ordered by `burst_index`, filtered
 * by the same predicate, `404` on a burst with no visible frames. Writing the
 * client against the frozen contract is what lets the pile fan in this step
 * rather than waiting a step; the tests stub the fetch, and the end-to-end case
 * is written and skipped until the route lands.
 *
 * Cite this path and not `/api/bursts/:burstId/items`, which is the guess the
 * ruling exists to correct.
 */

/** The response shape, which the collection envelope wraps like every other. */
export const burstFramesResponseSchema = collectionSchema({
  resourceKey: "frames",
  itemSchema: itemSummarySchema,
});

/** A burst's visible frames, oldest first. */
export type BurstFramesResponse = {
  frames: ItemSummary[];
  nextCursor: string | null;
};

/** The exact path a burst's frames are asked for at. */
export function makeFramesPathFromBurstId(burstId: string): string {
  return `/bursts/${encodeURIComponent(burstId)}/frames`;
}

/** One burst's visible frames, fetched when somebody presses the stack. */
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
