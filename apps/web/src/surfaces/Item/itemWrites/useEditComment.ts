import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  getCommentTagFailuresFromError,
  updateComment,
  type CommentTagFailure,
} from "@/api/comments/comments";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  type PrivateAuthority,
} from "@/api/me/privateQueryHelpers";
import { itemWriteFailure } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { makeItemDetailFromSavedComment } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteHelpers/itemWriteHelpers";
import { useUpdateCachedItem } from "@/surfaces/Item/itemWrites/useUpdateCachedItem";
import type { CommentDraft } from "@/system/commentDraftHelpers/commentDraftHelpers";
import type { CommentDto } from "@memory-shoebox/shared";
import type { Query } from "@tanstack/react-query";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

type Submission = CommentDraft & {
  onSaved: (comment: CommentDto) => void;
  submittedQuery: Query | undefined;
  authority: PrivateAuthority;
};

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
  const mutationKey = ["items", itemId, "comment", commentId, "edit"];
  const isCurrent = (submission: Submission) => {
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
      const submitted = mutation.state.variables as Submission | undefined;
      return (
        !!submitted &&
        isPrivateAuthorityCurrent(queryClient, submitted.authority)
      );
    },
  };
  const numPending = useIsMutating(filters);
  const mutation = useMutation({
    mutationKey,
    scope: makeWriteScopeFromItemId(itemId),
    mutationFn: async (body: Submission) => {
      if (!isCurrent(body)) {
        return undefined;
      }
      return updateComment({
        commentId,
        body: { body: body.body, commentTags: body.commentTags },
      });
    },
    onSuccess: (comment, submission) => {
      if (!comment || !isCurrent(submission)) {
        return;
      }
      updateCachedItem((detail) => {
        return makeItemDetailFromSavedComment({ detail, comment });
      });
      submission.onSaved(comment);
    },
    onError: (error, submission) => {
      if (isCurrent(submission)) {
        refetchItemWhenRefused({ queryClient, itemId, error });
      }
    },
  });
  return {
    save: ({ body, commentTags, onSaved }) => {
      if (queryClient.isMutating(filters) > 0) {
        return;
      }
      const queryKey = ["items", itemId];
      const submittedQuery = queryClient
        .getQueryCache()
        .find({ queryKey, exact: true });
      mutation.mutate({
        body,
        commentTags,
        onSaved,
        submittedQuery,
        authority: capturePrivateAuthority(queryClient),
      });
    },
    isSaving: numPending > 0,
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
