import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  type PrivateAuthority,
} from "@/api/me/privateQueryHelpers";
import type { Query } from "@tanstack/react-query";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { CreateCommentRequest } from "@memory-shoebox/shared";
import {
  createComment,
  getCommentTagFailuresFromError,
  type CommentTagFailure,
} from "@/api/comments/comments";
import { commentSendFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { makeItemDetailFromSavedComment } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";

type CommentSubmission = { draft: CreateCommentRequest; onSent: () => void };
type PendingSubmission = CommentSubmission & {
  submittedQuery: Query | undefined;
  authority: PrivateAuthority;
};

/** What the composer needs. `onSent` clears it, and only on success. */
export type CommentSend = {
  send: (options: Readonly<CommentSubmission>) => void;
  isSending: boolean;
  error: string | undefined;
  tagFailure: CommentTagFailure[];
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
  const isCurrent = (submission: PendingSubmission) => {
    return (
      isPrivateAuthorityCurrent(queryClient, submission.authority) &&
      !!submission.submittedQuery &&
      queryClient
        .getQueryCache()
        .find({ queryKey: ["items", itemId], exact: true }) ===
        submission.submittedQuery
    );
  };
  const filters = {
    mutationKey,
    exact: true,
    predicate: (mutation: { state: { variables?: unknown } }) => {
      const submitted = mutation.state.variables as
        | PendingSubmission
        | undefined;
      return (
        !!submitted &&
        isPrivateAuthorityCurrent(queryClient, submitted.authority)
      );
    },
  };
  const numPendingSends = useIsMutating(filters);
  const mutation = useMutation({
    mutationKey,
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: ({ draft }: PendingSubmission) => {
      return createComment({ itemId, body: draft });
    },
    onSuccess: (comment, submitted) => {
      if (!isCurrent(submitted)) {
        return;
      }
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
      // Mutation-level callbacks survive composer observer unmount.
      submitted.onSent();
    },
    onError: (error, submitted) => {
      if (isCurrent(submitted)) {
        refetchItemWhenRefused({ queryClient, itemId, error });
      }
    },
  });
  return {
    send: ({ draft, onSent }) => {
      // The cache sees mutate synchronously, including a remounted composer.
      if (queryClient.isMutating(filters) > 0) {
        return;
      }
      mutation.mutate({
        draft,
        onSent,
        authority: capturePrivateAuthority(queryClient),
        submittedQuery: queryClient
          .getQueryCache()
          .find({ queryKey: ["items", itemId], exact: true }),
      });
    },
    isSending: numPendingSends > 0,
    tagFailure: getCommentTagFailuresFromError(
      mutation.error,
      mutation.variables?.draft,
    ),
    error:
      mutation.error === null ? undefined : commentSendFailure(mutation.error),
  };
}
