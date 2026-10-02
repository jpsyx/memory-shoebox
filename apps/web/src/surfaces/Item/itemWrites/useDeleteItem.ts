import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteItem } from "@/api/items/items";
import { itemWriteFailure } from "@/surfaces/Item/itemCopy/itemCopy";
import {
  makeWriteScopeFromItemId,
  markPileStale,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteScope";

/**
 * The delete. Nothing blocks it (`items.md` § `DELETE /api/items/:itemId`).
 *
 * The item's own cache entry is left alone rather than removed: the page is
 * still mounted when the answer lands, and removing an observed query makes
 * it fetch again, which would flash "not here" before the way out is taken.
 * Going forward in history to it later refetches, and answers `404`, which is
 * the truth.
 */
export function useDeleteItem(itemId: string): {
  remove: (onDeleted: () => void) => void;
  isDeleting: boolean;
  error: string | undefined;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: () => {
      return deleteItem(itemId);
    },
    onSuccess: () => {
      markPileStale(queryClient);
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    remove: (onDeleted) => {
      mutation.mutate(undefined, { onSuccess: onDeleted });
    },
    isDeleting: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
