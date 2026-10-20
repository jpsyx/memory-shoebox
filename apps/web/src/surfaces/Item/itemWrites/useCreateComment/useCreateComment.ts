import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { CreateCommentRequest } from "@memory-shoebox/shared";
import { createComment } from "@/api/comments/comments";
import { commentSendFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { makeItemDetailFromSavedComment } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";

type CommentSubmission = { draft: CreateCommentRequest; onSent: () => void };

/** What the composer needs. `onSent` clears it, and only on success. */
export type CommentSend = {
  send: (options: Readonly<CommentSubmission>) => void;
  isSending: boolean;
  error: string | undefined;
};

/**
 * Says something, and appends the answer to the thread.
 *
 * A send made while one is in flight is ignored.
 */
export function useCreateComment(itemId: string): CommentSend {
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(itemId);
  const mutationKey = ["items", itemId, "comments"];
  const filters = { mutationKey, exact: true };
  const numPendingSends = useIsMutating(filters);
  const mutation = useMutation({
    mutationKey,
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: ({ draft }: CommentSubmission) => {
      return createComment({ itemId, body: draft });
    },
    onSuccess: (comment, { onSent }) => {
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
      // Mutation-level callbacks survive composer observer unmount.
      onSent();
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
  });
  return {
    send: ({ draft, onSent }) => {
      // The cache sees mutate synchronously, including a remounted composer.
      if (queryClient.isMutating(filters) > 0) {
        return;
      }
      mutation.mutate({ draft, onSent });
    },
    isSending: numPendingSends > 0,
    error:
      mutation.error === null ? undefined : commentSendFailure(mutation.error),
  };
}
