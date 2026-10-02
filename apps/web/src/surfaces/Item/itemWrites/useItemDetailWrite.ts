import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemDetail } from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { itemWriteFailure } from "@/surfaces/Item/itemCopy/itemCopy";
import {
  makeWriteScopeFromItemId,
  markPileStale,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteScope";

/**
 * What one call may hear back, after the cache has been written.
 *
 * Only the latest call hears anything, and only while the component that
 * made it is still mounted: TanStack Query drops a `mutate` call's own
 * callbacks once another call or an unmount has replaced it. The cache is
 * written either way.
 */
export type WriteCallbacks = {
  onSuccess?: () => void;
  onError?: () => void;
};

/**
 * What a sheet needs to draw one write: the call, its progress, its failure.
 */
export type ItemWrite<TVariables> = {
  /** Sends it. `callbacks` fire only for the latest call, while mounted. */
  save: (variables: TVariables, callbacks?: Readonly<WriteCallbacks>) => void;
  isSaving: boolean;
  /** Whatever went wrong, already in words. */
  error: string | undefined;
};

/**
 * A write that answers with the whole `ItemDetail`: the description, the
 * tags, the people, the visibility and the capture date.
 *
 * The answer replaces the cache entry, which is also how the composed alt
 * text follows a people change in the same response (`items.md`
 * § `PUT /api/items/:itemId/people`, transformation 4).
 */
export function useItemDetailWrite<TVariables>(
  options: Readonly<{
    itemId: string;
    mutationFn: (variables: TVariables) => Promise<ItemDetail>;
  }>,
): ItemWrite<TVariables> {
  const queryClient = useQueryClient();
  const { itemId } = options;
  const mutation = useMutation({
    mutationKey: ["items", itemId, "write"],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: options.mutationFn,
    onSuccess: (detail) => {
      queryClient.setQueryData(itemQueryOptions(itemId).queryKey, detail);
      markPileStale(queryClient);
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });

  return {
    save: (variables, callbacks) => {
      mutation.mutate(variables, {
        onSuccess: () => {
          callbacks?.onSuccess?.();
        },
        onError: () => {
          callbacks?.onError?.();
        },
      });
    },
    isSaving: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
