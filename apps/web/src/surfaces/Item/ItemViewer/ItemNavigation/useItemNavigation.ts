import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { ItemDetail } from "@memory-shoebox/shared";
import { getViewFromSearch } from "@/api/timeline/selection/selection";
import { getItemNeighboursFromDetail } from "./itemNavigationHelpers";
import { useItemNavigationMove } from "./useItemNavigationMove";
import type {
  ItemNavigationContext,
  ItemNavigationState,
} from "./itemNavigation.types";

function _makeNeighboursQueryOptions(context: Readonly<ItemNavigationContext>) {
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
    ],
    queryFn: () => {
      return getItemNeighboursFromDetail(context);
    },
    retry: false,
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
  const queryClient = useQueryClient();
  const selection =
    location.state.itemNavigationSelection ?? getViewFromSearch({}).selection;
  const context = { ...options, selection, queryClient };
  const query = useQuery({
    ..._makeNeighboursQueryOptions(context),
    enabled: !options.isPlaceholder,
  });
  const movement = useItemNavigationMove({
    context,
    targets: query.data,
    isUnavailable: options.isPlaceholder || query.isPending,
  });
  const isUnavailable =
    options.isPlaceholder || movement.isMoving || query.isPending;
  return {
    previous: !isUnavailable && query.data?.previous !== undefined,
    next: !isUnavailable && query.data?.next !== undefined,
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
