import type { MediaNeighborsResponse } from "@memory-shoebox/shared";
import { useContext, useEffect, useLayoutEffect } from "react";
import { useMediaLoading } from "./MediaLoadingContext";
import { ViewerReadinessContext } from "./PhotoReadinessContext";
import { getSelectedSourceFromPreview } from "./getSelectedSourceFromPreview";
import {
  getPrefetchCandidatesFromNeighbors,
  getPrefetchEnvironmentFromBrowser,
} from "./mediaPrefetchPolicyHelpers/mediaPrefetchPolicyHelpers";
/**
 * Starts the bounded window only after the selected media reports readiness.
 */
export function useNeighborPrefetch({
  itemId,
  enabled,
  neighbors,
}: Readonly<{
  itemId: string;
  enabled: boolean;
  neighbors: MediaNeighborsResponse | undefined;
}>): void {
  const resources = useMediaLoading();
  const readiness = useContext(ViewerReadinessContext);
  const direction = resources.navigation.direction;
  useLayoutEffect(() => {
    if (enabled && readiness?.itemId === itemId) {
      resources.navigation.viewport = readiness.viewport;
    }
  }, [enabled, readiness, itemId, resources]);
  useEffect(
    function scheduleNeighborPrefetch() {
      if (!enabled || readiness?.itemId !== itemId || neighbors === undefined) {
        return;
      }
      const candidates = getPrefetchCandidatesFromNeighbors({
        neighbors,
        selectPhotoSource: (preview) => {
          return getSelectedSourceFromPreview({
            preview,
            viewport: readiness.viewport,
          });
        },
      });
      resources.scheduler.schedule({
        candidates: candidates.filter((candidate) => {
          return readiness.photosReady || candidate.kind === "poster";
        }),
        environment: getPrefetchEnvironmentFromBrowser({
          memberId: resources.memberId,
          selectionKey: `${readiness.sourceKey}:${direction}:${readiness.photosReady}`,
        }),
      });
      return () => {
        resources.scheduler.clear();
      };
    },
    [readiness, neighbors, itemId, enabled, resources, direction],
  );
}
