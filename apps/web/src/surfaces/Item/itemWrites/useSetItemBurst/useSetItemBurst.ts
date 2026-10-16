import type { ItemDetail } from "@memory-shoebox/shared";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { itemQueryOptions, setItemBurst } from "@/api/items/items";
import { TIMELINE_QUERY_KEY } from "@/api/timelineHelpers/timelineHelpers";
import { itemWriteFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";

/** The burst editor's write, progress and retryable failure. */
export type ItemBurstWrite = {
  save: (onSaved: () => void) => void;
  isPending: boolean;
  error: string | undefined;
};

/** Refreshes membership reads without recording extra item opens. */
async function _refreshBurstReads(
  queryClient: QueryClient,
  detail: ItemDetail,
): Promise<void> {
  // Siblings may have a new position or lose their strip. Permalink reads
  // count opens, so refresh their details only when the viewer arrives.
  await queryClient.invalidateQueries({
    queryKey: ["items"],
    refetchType: "none",
  });
  queryClient.setQueryData(itemQueryOptions(detail.itemId).queryKey, detail);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: TIMELINE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ["bursts"], refetchType: "all" }),
  ]);
}

/**
 * Writes one photo's membership and refreshes the pile without counting opens.
 */
export function useSetItemBurst(
  itemId: string,
  action: "remove" | "restore",
): ItemBurstWrite {
  const queryClient = useQueryClient();
  const isInFlightRef = useRef(false);
  const mutation = useMutation({
    mutationKey: ["items", itemId, "burst", action],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: () => {
      return setItemBurst({ itemId, action });
    },
    onSuccess: (detail) => {
      return _refreshBurstReads(queryClient, detail);
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
    onSettled: () => {
      isInFlightRef.current = false;
    },
  });
  return {
    save: (onSaved) => {
      if (isInFlightRef.current) {
        return;
      }
      isInFlightRef.current = true;
      mutation.mutate(undefined, { onSuccess: onSaved });
    },
    isPending: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
