import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateComment } from "@/api/comments/comments";
import { itemWriteFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { makeItemDetailFromSavedComment } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";

/** Edits one comment's body, and puts the answer where it stood. */
export function useEditComment(
  options: Readonly<{ itemId: string; commentId: string }>,
): {
  save: (options: Readonly<{ body: string; onSaved: () => void }>) => void;
  isSaving: boolean;
  error: string | undefined;
} {
  const { itemId, commentId } = options;
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(itemId);
  const mutation = useMutation({
    mutationKey: ["items", itemId, "comment", commentId, "edit"],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: (body: string) => {
      return updateComment({ commentId, body: { body } });
    },
    onSuccess: (comment) => {
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    save: ({ body, onSaved }) => {
      mutation.mutate(body, { onSuccess: onSaved });
    },
    isSaving: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}
