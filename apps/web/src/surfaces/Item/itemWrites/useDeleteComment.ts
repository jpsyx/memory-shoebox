import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteComment } from "@/api/comments/comments";
import { itemWriteFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { makeItemDetailFromDeletedComment } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";

/**
 * Takes one comment down, and out of the thread. `onDeleted` is called once
 * the server has it, before the row is drawn without it.
 */
export function useDeleteComment(
  options: Readonly<{ itemId: string; commentId: string }>,
): { remove: (onDeleted?: () => void) => void; error: string | undefined } {
  const { itemId, commentId } = options;
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(itemId);
  const mutation = useMutation({
    mutationKey: ["items", itemId, "comment", commentId, "delete"],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: () => {
      return deleteComment(commentId);
    },
    onSuccess: () => {
      updateCachedItem((detail) => {
        return makeItemDetailFromDeletedComment({ detail, commentId });
      });
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    remove: (onDeleted) => {
      mutation.mutate(undefined, { onSuccess: onDeleted });
    },
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
