import type { CommentDto } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateComment,
  getCommentTagFailuresFromError,
  type CommentTagFailure,
} from "@/api/comments/comments";
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
  save: (
    options: Readonly<
      CommentDraft & { onSaved: (comment: CommentDto) => void }
    >,
  ) => void;
  isSaving: boolean;
  error: string | undefined;
  tagFailure: CommentTagFailure[];
} {
  const { itemId, commentId } = options;
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(itemId);
  const mutation = useMutation({
    mutationKey: ["items", itemId, "comment", commentId, "edit"],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: (body: CommentDraft) => {
      return updateComment({ commentId, body });
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
    save: ({ body, commentTags, onSaved }) => {
      const queryKey = ["items", itemId];
      const submittedQuery = queryClient
        .getQueryCache()
        .find({ queryKey, exact: true });
      mutation.mutate(
        { body, commentTags },
        {
          onSuccess: (saved) => {
            if (
              submittedQuery &&
              queryClient.getQueryCache().find({ queryKey, exact: true }) ===
                submittedQuery
            ) {
              onSaved(saved);
            }
          },
        },
      );
    },
    isSaving: mutation.isPending,
    tagFailure: getCommentTagFailuresFromError(
      mutation.error,
      mutation.variables,
    ),
    error:
      mutation.error === null
        ? undefined
        : mutation.error instanceof ApiRequestError &&
            ["rate_limited", "forbidden", "not_found", "unauthorized"].includes(
              mutation.error.code,
            )
          ? itemWriteFailure(mutation.error)
          : "Couldn't save your changes.",
  };
}
