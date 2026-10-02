import {
  reactionSummarySchema,
  type ReactionKind,
  type ReactionSummary,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/client/client";
import { makeItemPathFromItemId } from "@/api/items/items";

/**
 * The four reaction routes. Setting answers with the whole summary, because
 * that is what the row draws; taking one off answers `204`, and the caller
 * removes its own row from the summary it holds (`items.md` § Reactions).
 */

/** Where a comment's reaction lives. */
function _commentReactionPath(commentId: string): string {
  return `/comments/${encodeURIComponent(commentId)}/reaction`;
}

/** Sets or changes mine on an item. */
export function setItemReaction(
  options: Readonly<{ itemId: string; kind: ReactionKind }>,
): Promise<ReactionSummary> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/reaction`,
    schema: reactionSummarySchema,
    init: jsonInit({ method: "PUT", body: { kind: options.kind } }),
  });
}

/** Takes mine off an item. */
export function clearItemReaction(itemId: string): Promise<void> {
  return apiFetch({
    path: `${makeItemPathFromItemId(itemId)}/reaction`,
    schema: z.void(),
    init: { method: "DELETE" },
  });
}

/** Sets or changes mine on a comment. */
export function setCommentReaction(
  options: Readonly<{ commentId: string; kind: ReactionKind }>,
): Promise<ReactionSummary> {
  return apiFetch({
    path: _commentReactionPath(options.commentId),
    schema: reactionSummarySchema,
    init: jsonInit({ method: "PUT", body: { kind: options.kind } }),
  });
}

/** Takes mine off a comment. */
export function clearCommentReaction(commentId: string): Promise<void> {
  return apiFetch({
    path: _commentReactionPath(commentId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
