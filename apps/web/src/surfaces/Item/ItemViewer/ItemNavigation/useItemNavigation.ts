import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type {
  ItemDetail,
  MediaNeighborsResponse,
} from "@memory-shoebox/shared";
import { getViewFromSearch } from "@/api/timeline/selection/selection";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import { useNeighborPrefetch } from "@/media/useNeighborPrefetch";
import type { MediaLoadingResources } from "@/media/createMediaLoadingResources";
import { useItemNavigationMove } from "./useItemNavigationMove";
import type {
  ItemNavigationContext,
  ItemNavigationState,
} from "./itemNavigation.types";

function _makeNeighboursQueryOptions(
  context: Readonly<ItemNavigationContext>,
  resources: MediaLoadingResources,
) {
  return {
    queryKey: [
      "timeline",
      context.memberId,
      "item-neighbours",
      context.detail.itemId,
      context.detail.capturedOn,
      context.detail.capturedAt,
      context.detail.burst?.burstId,
      context.detail.tags,
      context.detail.people,
      context.detail.visibility,
      context.selection,
      resources.navigation.direction,
    ],
    queryFn: () => {
      return resources.readNeighbors({
        itemId: context.detail.itemId,
        selection: context.selection,
        direction: resources.navigation.direction,
      });
    },
    retry: false,
  };
}

function _getTargetsFromNeighbors(
  neighbors: MediaNeighborsResponse | undefined,
  direction: "previous" | "next",
) {
  return neighbors === undefined
    ? undefined
    : {
        next: (direction === "next" ? neighbors.ahead : neighbors.behind)[0],
        previous: (direction === "previous"
          ? neighbors.ahead
          : neighbors.behind)[0],
      };
}

/** Loads neighbours and keeps moves serialized until the destination is drawn. */
export function useItemNavigation(
  options: Readonly<{
    detail: ItemDetail;
    isPlaceholder: boolean;
    memberId: string;
  }>,
): ItemNavigationState {
  const location = useLocation();
  const resources = useMediaLoading();
  const queryClient = useQueryClient();
  const selection =
    location.state.itemNavigationSelection ?? getViewFromSearch({}).selection;
  const context = { ...options, selection, queryClient };
  const query = useQuery({
    ..._makeNeighboursQueryOptions(context, resources),
    enabled: !options.isPlaceholder,
  });
  const targets = _getTargetsFromNeighbors(
    query.data,
    resources.navigation.direction,
  );
  useNeighborPrefetch({
    itemId: options.detail.itemId,
    enabled: !options.isPlaceholder,
    neighbors: query.data,
  });
  const movement = useItemNavigationMove({
    context,
    targets,
    isUnavailable: options.isPlaceholder || query.isPending,
  });
  const isUnavailable =
    options.isPlaceholder || movement.isMoving || query.isPending;
  return {
    previous: !isUnavailable && targets?.previous !== undefined,
    next: !isUnavailable && targets?.next !== undefined,
    move: movement.move,
    error:
      movement.error ??
      (query.isError ? "Navigation is unavailable. Try again." : undefined),
    retry: () => {
      movement.clearError();
      void query.refetch();
    },
  };
}
