import { fetchMediaNeighbors } from "@/api/mediaPreview/mediaPreview";
import type {
  ItemDirection,
  ItemNavigationContext,
  ItemNavigationTarget,
} from "./itemNavigation.types";

/** Exact directional burst edges come from one bounded, side-effect-free read. */
export async function getItemNeighboursFromDetail(
  context: Readonly<ItemNavigationContext>,
): Promise<Record<ItemDirection, ItemNavigationTarget | undefined>> {
  const neighbors = await context.queryClient.fetchQuery({
    queryKey: [
      "timeline",
      context.memberId,
      "media-neighbors",
      context.detail.itemId,
      context.selection,
    ],
    queryFn: ({ signal }) => {
      return fetchMediaNeighbors(
        {
          itemId: context.detail.itemId,
          selection: context.selection,
          direction: "next",
        },
        signal,
      );
    },
    staleTime: 30_000,
  });
  return {
    previous:
      neighbors.behind[0] === undefined
        ? undefined
        : { itemId: neighbors.behind[0].itemId },
    next:
      neighbors.ahead[0] === undefined
        ? undefined
        : { itemId: neighbors.ahead[0].itemId },
  };
}
