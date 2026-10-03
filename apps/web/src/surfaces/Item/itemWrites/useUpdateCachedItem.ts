import { useQueryClient } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";

/** Rewrites the cached item, if there is one. */
export function useUpdateCachedItem(
  itemId: string,
): (update: (detail: ItemDetail) => ItemDetail) => void {
  const queryClient = useQueryClient();
  return (update) => {
    queryClient.setQueryData(itemQueryOptions(itemId).queryKey, (detail) => {
      return detail === undefined ? detail : update(detail);
    });
  };
}
