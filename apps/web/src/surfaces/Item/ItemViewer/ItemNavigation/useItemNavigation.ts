import type { KnownMediaNeighborsResponse } from "@/media/readMediaNeighborsFromKnownQueries";
import type {
  ItemDirection,
  ItemNavigationContext,
  ItemNavigationState,
} from "./itemNavigation.types";
import type {
  MediaPreview,
  ItemDetail,
  MediaNeighborsResponse,
} from "@memory-shoebox/shared";
import { getViewFromSearch } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import type { MediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { getNavigationSelectionFromView } from "@/media/getNavigationSelectionFromView";
import { useMediaLoading } from "@/media/MediaLoadingContext";
import { readMediaNeighborsFromKnownQueries } from "@/media/readMediaNeighborsFromKnownQueries";
import { useNeighborPrefetch } from "@/media/useNeighborPrefetch";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useItemNavigationMove } from "./useItemNavigationMove";

function _makeNeighboursQueryOptions({
  context,
  resources,
}: {
  context: Readonly<ItemNavigationContext>;
  resources: MediaLoadingResources;
}): ReturnType<typeof queryOptions<KnownMediaNeighborsResponse>> {
  return queryOptions<KnownMediaNeighborsResponse>({
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
      return readMediaNeighborsFromKnownQueries({
        resources,
        queryClient: context.queryClient,
        request: {
          itemId: context.detail.itemId,
          selection: context.selection,
          direction: resources.navigation.direction,
        },
      });
    },
    staleTime: (query) => {
      const metadataUpdatedAt =
        query.state.data?.metadataUpdatedAt ?? query.state.dataUpdatedAt;
      return Math.max(
        0,
        metadataUpdatedAt + 30_000 - query.state.dataUpdatedAt,
      );
    },
    retry: false,
  });
}

function _getTargetsFromNeighbors({
  neighbors,
  direction,
}: {
  neighbors: MediaNeighborsResponse | undefined;
  direction: "previous" | "next";
}): Record<ItemDirection, MediaPreview | undefined> | undefined {
  return neighbors === undefined
    ? undefined
    : {
        next: (direction === "next" ? neighbors.ahead : neighbors.behind)[0],
        previous: (direction === "previous"
          ? neighbors.ahead
          : neighbors.behind)[0],
      };
}

function useNavigationSelection(): ReturnType<
  typeof getNavigationSelectionFromView
> {
  const location = useLocation();
  return getNavigationSelectionFromView({
    selection:
      location.state.itemNavigationSelection ?? getViewFromSearch({}).selection,
    at: undefined,
  });
}

/**
 * Loads neighbours and keeps moves serialized until the destination is drawn.
 */
export function useItemNavigation(
  options: Readonly<{
    detail: ItemDetail;
    isPlaceholder: boolean;
    memberId: string;
  }>,
): ItemNavigationState {
  const resources = useMediaLoading();
  const queryClient = useQueryClient();
  const selection = useNavigationSelection();
  const context = { ...options, selection, queryClient };
  const query = useQuery({
    ..._makeNeighboursQueryOptions({ context, resources }),
    enabled: !options.isPlaceholder,
  });
  const targets = _getTargetsFromNeighbors({
    neighbors: query.data,
    direction: resources.navigation.direction,
  });
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
