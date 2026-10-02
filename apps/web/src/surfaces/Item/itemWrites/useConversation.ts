import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  CreateCommentRequest,
  ItemDetail,
  MemberRef,
  ReactionKind,
  ReactionSummary,
} from "@memory-shoebox/shared";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/api/comments/comments";
import { itemQueryOptions } from "@/api/items/items";
import {
  clearCommentReaction,
  clearItemReaction,
  setCommentReaction,
  setItemReaction,
} from "@/api/reactions/reactions";
import { makeSummaryFromChoice } from "@/system/Reactions/presentReactions";
import {
  commentSendFailure,
  itemWriteFailure,
  REACTION_FAILURE,
} from "@/surfaces/Item/itemCopy/itemCopy";
import {
  makeItemDetailFromCommentReactions,
  makeItemDetailFromDeletedComment,
  makeItemDetailFromItemReactions,
  makeItemDetailFromSavedComment,
} from "@/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates";
import {
  makeWriteScopeFromItemId,
  refetchItemWhenRefused,
} from "@/surfaces/Item/itemWrites/itemWriteScope";

/**
 * Comments and both reaction sets: the writes that answer with something
 * smaller than the whole item, which the cache updates in
 * `itemCacheUpdates.ts` fold back in.
 */

/** Rewrites the cached item, if there is one. */
function useUpdateCachedItem(
  itemId: string,
): (update: (detail: ItemDetail) => ItemDetail) => void {
  const queryClient = useQueryClient();
  return (update) => {
    queryClient.setQueryData(itemQueryOptions(itemId).queryKey, (detail) => {
      return detail === undefined ? detail : update(detail);
    });
  };
}

/** What the composer needs. `onSent` clears it, and only on success. */
export type CommentSend = {
  send: (draft: CreateCommentRequest, onSent: () => void) => void;
  isSending: boolean;
  error: string | undefined;
};

/**
 * Says something, and appends the answer to the thread.
 *
 * A send made while one is in flight is ignored. `isPending` reaches the
 * component a macrotask after `mutate`, so a double press inside that window
 * would otherwise queue a second POST and post the comment twice.
 */
export function useCreateComment(itemId: string): CommentSend {
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(itemId);
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
    send: (draft, onSent) => {
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

/** Edits one comment's body, and puts the answer where it stood. */
export function useEditComment(
  options: Readonly<{ itemId: string; commentId: string }>,
): {
  save: (body: string, onSaved: () => void) => void;
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
    save: (body, onSaved) => {
      mutation.mutate(body, { onSuccess: onSaved });
    },
    isSaving: mutation.isPending,
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}

/** Takes one comment down, and out of the thread. */
export function useDeleteComment(
  options: Readonly<{ itemId: string; commentId: string }>,
): { remove: () => void; error: string | undefined } {
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
    remove: () => {
      mutation.mutate();
    },
    error:
      mutation.error === null ? undefined : itemWriteFailure(mutation.error),
  };
}

/** What a reaction row needs. */
export type ReactionWrite = {
  react: (kind: ReactionKind | null) => void;
  error: string | undefined;
};

/** Where one reaction summary lives inside the item, and how to set it. */
type ReactionTarget = {
  itemId: string;
  /** Carries every id the summary hangs off (`itemWriteScope.ts`). */
  mutationKey: string[];
  viewer: MemberRef;
  getSummary: (detail: ItemDetail) => ReactionSummary | undefined;
  makeDetail: (detail: ItemDetail, reactions: ReactionSummary) => ItemDetail;
  mutationFn: (
    kind: ReactionKind | null,
  ) => Promise<ReactionSummary | undefined>;
};

/**
 * Reads the one summary a target names in the cached item, and rewrites it.
 *
 * `writeOwnChoice` moves only the viewer's own row, in whatever the cache
 * holds at that moment, so every other member's row stays as the latest
 * answer left it.
 */
function useCachedSummary(target: Readonly<ReactionTarget>): {
  readSummary: () => ReactionSummary | undefined;
  writeSummary: (reactions: ReactionSummary) => void;
  writeOwnChoice: (chosen: ReactionKind | null) => void;
} {
  const queryClient = useQueryClient();
  const updateCachedItem = useUpdateCachedItem(target.itemId);
  const readSummary = () => {
    const detail = queryClient.getQueryData(
      itemQueryOptions(target.itemId).queryKey,
    );
    return detail === undefined ? undefined : target.getSummary(detail);
  };
  const writeSummary = (reactions: ReactionSummary) => {
    updateCachedItem((detail) => {
      return target.makeDetail(detail, reactions);
    });
  };
  return {
    readSummary,
    writeSummary,
    writeOwnChoice: (chosen) => {
      const current = readSummary();
      if (current !== undefined) {
        writeSummary(
          makeSummaryFromChoice({
            reactions: current,
            chosen,
            viewer: target.viewer,
          }),
        );
      }
    },
  };
}

/**
 * One reaction, written into the cache before the request goes, and put back
 * if it fails.
 *
 * The cache, rather than the control, carries the tap, because the cache is
 * what a failure can roll back: `Reactions` follows `myKind` whenever it
 * moves.
 *
 * **Only the latest tap writes its outcome**, and a counter says which tap
 * that is, not a comparison of the cache with the tap. The scope delays a
 * tap's request but not its `onMutate`, so an earlier save's answer can land
 * on top of the optimistic summary, and a comparison would then take the
 * tap's own answer for a stale one and drop it. The outcome goes onto
 * whatever the cache holds by then, never a snapshot from before the tap:
 * the answer itself, or for a `204` or a failure, the viewer's own row moved
 * (`items.md` § Reactions).
 */
function useReaction(target: Readonly<ReactionTarget>): ReactionWrite {
  const queryClient = useQueryClient();
  const { readSummary, writeSummary, writeOwnChoice } =
    useCachedSummary(target);
  const latestTapRef = useRef(0);
  const mutation = useMutation({
    mutationKey: target.mutationKey,
    scope: makeWriteScopeFromItemId(target.itemId),
    mutationFn: target.mutationFn,
    onMutate: (kind) => {
      latestTapRef.current += 1;
      const previousKind = readSummary()?.myKind ?? null;
      writeOwnChoice(kind);
      return { tap: latestTapRef.current, previousKind };
    },
    onError: (error, _kind, context) => {
      if (context !== undefined && context.tap === latestTapRef.current) {
        writeOwnChoice(context.previousKind);
      }
      refetchItemWhenRefused({ queryClient, itemId: target.itemId, error });
    },
    onSuccess: (summary, _kind, context) => {
      if (context.tap !== latestTapRef.current) {
        return;
      }
      // A `204` answers with nothing, so our own row comes off what is there.
      if (summary === undefined) {
        writeOwnChoice(null);
      } else {
        writeSummary(summary);
      }
    },
  });
  return {
    react: (kind) => {
      mutation.mutate(kind);
    },
    error: mutation.error === null ? undefined : REACTION_FAILURE,
  };
}

/** The reaction on the photograph or the video itself. */
export function useItemReaction(
  options: Readonly<{ itemId: string; viewer: MemberRef }>,
): ReactionWrite {
  const { itemId } = options;
  return useReaction({
    itemId,
    mutationKey: ["items", itemId, "reaction"],
    viewer: options.viewer,
    getSummary: (detail) => {
      return detail.reactions;
    },
    makeDetail: (detail, reactions) => {
      return makeItemDetailFromItemReactions({ detail, reactions });
    },
    mutationFn: (kind) => {
      return kind === null
        ? clearItemReaction(itemId).then(() => {
            return undefined;
          })
        : setItemReaction({ itemId, kind });
    },
  });
}

/** The reaction on one comment. */
export function useCommentReaction(
  options: Readonly<{ itemId: string; commentId: string; viewer: MemberRef }>,
): ReactionWrite {
  const { itemId, commentId } = options;
  return useReaction({
    itemId,
    mutationKey: ["items", itemId, "comment", commentId, "reaction"],
    viewer: options.viewer,
    getSummary: (detail) => {
      return detail.comments.find((comment) => {
        return comment.commentId === commentId;
      })?.reactions;
    },
    makeDetail: (detail, reactions) => {
      return makeItemDetailFromCommentReactions({
        detail,
        commentId,
        reactions,
      });
    },
    mutationFn: (kind) => {
      return kind === null
        ? clearCommentReaction(commentId).then(() => {
            return undefined;
          })
        : setCommentReaction({ commentId, kind });
    },
  });
}
