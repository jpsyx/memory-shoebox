import { useState, type Dispatch, type SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { burstFramesQueryOptions } from "@/api/bursts/bursts";

/**
 * Fetches a burst's frames once, and remembers them by burst id.
 *
 * A failed fetch leaves the stack closed rather than throwing, which is
 * indistinguishable from pressing a burst whose frames have all been
 * restricted since the page loaded.
 *
 * **The updater is functional, and a captured map would be a bug.** Two
 * stacks can be pressed before either fetch answers, and both handlers are
 * then closures from the same render. Writing `new Map(captured).set(...)`
 * lets whichever answers last drop the other's frames, and a burst whose
 * entry is missing is unopenable for good: `BurstStack` fans only when its
 * frames are defined, and nothing asks for them a second time.
 */
function _makeOnOpenBurst(options: {
  queryClient: QueryClient;
  setFramesByBurstId: Dispatch<
    SetStateAction<Map<string, readonly BurstFrameRef[]>>
  >;
}): (burstId: string) => void {
  const { queryClient, setFramesByBurstId } = options;
  return (burstId) => {
    void queryClient
      .fetchQuery(burstFramesQueryOptions(burstId))
      .then((response) => {
        setFramesByBurstId((previousFrames) => {
          return new Map(previousFrames).set(burstId, response.frames);
        });
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
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst: (burstId: string) => void;
} {
  // Frames arrive from the burst's own route. Held here rather than in the
  // stack so a fan survives the page refetching around it.
  const [framesByBurstId, setFramesByBurstId] = useState<
    Map<string, readonly BurstFrameRef[]>
  >(() => {
    return new Map();
  });
  return {
    framesByBurstId,
    onOpenBurst: _makeOnOpenBurst({ queryClient, setFramesByBurstId }),
  };
}
