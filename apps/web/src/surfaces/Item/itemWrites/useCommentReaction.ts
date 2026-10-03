import type { MemberRef } from "@memory-shoebox/shared";
import {
  clearCommentReaction,
  setCommentReaction,
} from "@/api/reactions/reactions";
import { makeItemDetailFromCommentReactions } from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  useReaction,
  type ReactionWrite,
} from "@/surfaces/Item/itemWrites/useReaction";

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
    makeDetail: ({ detail, reactions }) => {
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
