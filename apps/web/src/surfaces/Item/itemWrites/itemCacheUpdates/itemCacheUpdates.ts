import type {
  CommentDto,
  ItemDetail,
  ReactionSummary,
} from "@memory-shoebox/shared";

/**
 * Pure updates of a cached `ItemDetail`, one per answer a write can give that
 * is not itself a whole `ItemDetail`.
 *
 * Kept apart from the hooks so that what each answer does to the page can be
 * read, and tested, without a query client.
 */

/** A comment the server has just accepted: new at the foot, edited in place. */
export function makeItemDetailFromSavedComment(
  options: Readonly<{ detail: ItemDetail; comment: CommentDto }>,
): ItemDetail {
  const { detail, comment } = options;
  const isKnown = detail.comments.some((candidate) => {
    return candidate.commentId === comment.commentId;
  });
  return {
    ...detail,
    comments: isKnown
      ? detail.comments.map((candidate) => {
          return candidate.commentId === comment.commentId
            ? comment
            : candidate;
        })
      : [...detail.comments, comment],
  };
}

/** A comment the server has taken down, which answers `204`. */
export function makeItemDetailFromDeletedComment(
  options: Readonly<{ detail: ItemDetail; commentId: string }>,
): ItemDetail {
  return {
    ...options.detail,
    comments: options.detail.comments.filter((candidate) => {
      return candidate.commentId !== options.commentId;
    }),
  };
}

/** The item's own reaction summary, replaced. */
export function makeItemDetailFromItemReactions(
  options: Readonly<{ detail: ItemDetail; reactions: ReactionSummary }>,
): ItemDetail {
  return { ...options.detail, reactions: options.reactions };
}

/** One comment's reaction summary, replaced. */
export function makeItemDetailFromCommentReactions(
  options: Readonly<{
    detail: ItemDetail;
    commentId: string;
    reactions: ReactionSummary;
  }>,
): ItemDetail {
  return {
    ...options.detail,
    comments: options.detail.comments.map((candidate) => {
      return candidate.commentId === options.commentId
        ? { ...candidate, reactions: options.reactions }
        : candidate;
    }),
  };
}
