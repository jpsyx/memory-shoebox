import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
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
 *
 * A press made while one is in flight is ignored, for the composer's reason:
 * `isDeleting` reaches the dialog a macrotask after `mutate`, and a second
 * press inside that window would otherwise queue a second `DELETE`. So is a
 * press made once it has landed: the way out is taken a moment later, and a
 * second `DELETE` before then answers `404` for something already gone.
 */
export function useDeleteItem(itemId: string): {
  remove: (onDeleted: () => void) => void;
  isDeleting: boolean;
  /** It has gone, and the way out is being taken. */
  isDeleted: boolean;
  error: string | undefined;
} {
  const queryClient = useQueryClient();
  const isInFlightRef = useRef(false);
  const mutation = useMutation({
    mutationKey: ["items", itemId, "delete"],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: () => {
      return deleteItem(itemId);
    },
    onSuccess: () => {
      markPileStale(queryClient);
    },
    onError: (error) => {
      isInFlightRef.current = false;
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    remove: (onDeleted) => {
      if (isInFlightRef.current) {
        return;
      }
      isInFlightRef.current = true;
      mutation.mutate(undefined, { onSuccess: onDeleted });
    },
    isDeleting: mutation.isPending,
    isDeleted: mutation.isSuccess,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
