import {
  burstFramesResponseSchema,
  type BurstFramesResponse,
  type BurstFrameRef,
} from "@memory-shoebox/shared";
import {
  apiFetch,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";
import { makeFramesPathFromBurstId } from "@/api/bursts/bursts";
import {
  makeQueryFromSelection,
  type TimelineSelection,
} from "@/api/timeline/selection/selection";

/** Follows every burst page so ticking a loaded stack never omits its tail. */
export async function getBurstFramesForSelection(
  burstId: string,
  filterSelection?: Readonly<TimelineSelection>,
): Promise<BurstFrameRef[]> {
  const frames: BurstFrameRef[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const searchParams = filterSelection
      ? makeQueryFromSelection(filterSelection)
      : new URLSearchParams();
    if (cursor !== null) {
      searchParams.set("cursor", cursor);
    }
    const page: BurstFramesResponse = await apiFetch({
      path: makePathFromSearchParams({
        basePath: makeFramesPathFromBurstId(burstId),
        searchParams,
      }),
      schema: burstFramesResponseSchema,
    });
    frames.push(...page.frames);
    cursor = page.nextCursor;
    if (cursor !== null && cursors.has(cursor)) {
      throw new Error("The stack repeated a page. Try ticking it again.");
    }
    if (cursor !== null) {
      cursors.add(cursor);
    }
  } while (cursor !== null);
  return frames;
}
