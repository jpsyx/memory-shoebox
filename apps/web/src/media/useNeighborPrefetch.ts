import { useContext, useEffect } from "react";
import type { MediaNeighborsResponse } from "@memory-shoebox/shared";
import { useMediaLoading } from "./MediaLoadingContext";
import { ViewerReadinessContext } from "./PhotoReadinessContext";
import {
  getPrefetchCandidatesFromNeighbors,
  getPrefetchEnvironmentFromBrowser,
} from "./mediaPrefetchPolicy";
import { getSelectedSourceFromPreview } from "./getSelectedSourceFromPreview";

type Options = {
  itemId: string;
  enabled: boolean;
  neighbors: MediaNeighborsResponse | undefined;
};
/** Starts the bounded window only after the selected media reports readiness. */
export function useNeighborPrefetch({
  itemId,
  enabled,
  neighbors,
}: Readonly<Options>): void {
  const resources = useMediaLoading();
  const readiness = useContext(ViewerReadinessContext);
  const direction = resources.navigation.direction;
  useEffect(() => {
    if (!enabled || readiness?.itemId !== itemId || neighbors === undefined) {
      return;
    }
    const candidates = getPrefetchCandidatesFromNeighbors({
      neighbors,
      selectPhotoSource: (preview) => {
        return getSelectedSourceFromPreview(preview, readiness.viewport);
      },
    });
    resources.scheduler.schedule(
      candidates.filter((candidate) => {
        return readiness.photosReady || candidate.kind === "poster";
      }),
      getPrefetchEnvironmentFromBrowser({
        memberId: resources.memberId,
        selectionKey: `${readiness.sourceKey}:${direction}:${readiness.photosReady}`,
      }),
    );
    return () => {
      resources.scheduler.clear();
    };
  }, [readiness, neighbors, itemId, enabled, resources, direction]);
}
