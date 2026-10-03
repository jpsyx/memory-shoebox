import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { CreateCommentRequest } from "@memory-shoebox/shared";
import { createComment } from "@/api/comments/comments";
import { commentSendFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { makeItemDetailFromSavedComment } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";

/** What the composer needs. `onSent` clears it, and only on success. */
export type CommentSend = {
  send: (
    options: Readonly<{ draft: CreateCommentRequest; onSent: () => void }>,
  ) => void;
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
  // `isPending` reaches the component a macrotask after `mutate`, so a double
  // press inside that window would otherwise queue a second POST and post the
  // comment twice.
  const isInFlightRef = useRef(false);
  const mutation = useMutation({
    mutationKey: ["items", itemId, "comments"],
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: (draft: CreateCommentRequest) => {
      return createComment({ itemId, body: draft });
    },
    onSuccess: (comment) => {
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
    },
    onError: (error) => {
      refetchItemWhenRefused({ queryClient, itemId, error });
    },
    onSettled: () => {
      isInFlightRef.current = false;
    },
  });
  return {
    send: ({ draft, onSent }) => {
      if (isInFlightRef.current) {
        return;
      }
      isInFlightRef.current = true;
      mutation.mutate(draft, { onSuccess: onSent });
    },
    isSending: mutation.isPending,
    error:
      mutation.error === null ? undefined : commentSendFailure(mutation.error),
  };
}
