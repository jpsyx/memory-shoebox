import { useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ItemSummary } from "@memory-shoebox/shared";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";

/**
 * Fetches a burst's frames once, and remembers them by burst id.
 *
 * A failed fetch leaves the stack closed rather than throwing: `5a` owns
 * `GET /api/bursts/:burstId/frames` and it is not merged yet, so today every
 * press behaves the same as a burst whose frames have all been restricted.
 */
function _makeOnOpenBurst(options: {
  queryClient: QueryClient;
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  setFramesByBurstId: (next: Map<string, readonly ItemSummary[]>) => void;
}): (burstId: string) => void {
  const { queryClient, framesByBurstId, setFramesByBurstId } = options;
  return (burstId) => {
    void queryClient
      .fetchQuery(burstFramesQueryOptions(burstId))
      .then((response) => {
        setFramesByBurstId(
          new Map(framesByBurstId).set(burstId, response.frames),
        );
      })
      .catch(() => {
        // The fan simply does not open, which is indistinguishable from the
        // stack being pressed on a burst whose frames are all restricted.
      });
  };
}

/**
 * The burst fan's own state and the handler that opens it.
 *
 * Kept apart from `useTimelineData` so that function holds one call rather
 * than the `useState` and the handler it feeds.
 */
export function useBurstFan(queryClient: QueryClient): {
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  onOpenBurst: (burstId: string) => void;
} {
  // Frames arrive from the burst's own route, which step 5a owns. Held here
  // rather than in the stack so a fan survives the page refetching around it.
  const [framesByBurstId, setFramesByBurstId] = useState<
    Map<string, readonly ItemSummary[]>
  >(() => {
    return new Map();
  });
  return {
    framesByBurstId,
    onOpenBurst: _makeOnOpenBurst({
      queryClient,
      framesByBurstId,
      setFramesByBurstId,
    }),
  };
}
