import {
  commentDtoSchema,
  type CommentDto,
  type CreateCommentRequest,
  type UpdateCommentRequest,
} from "@memory-shoebox/shared";
import { z } from "zod";
import { apiFetch, jsonInit } from "@/api/client/client";
import { makeItemPathFromItemId } from "@/api/items/items";

/** The exact path one comment lives at, below `/api`. */
function _commentPath(commentId: string): string {
  return `/comments/${encodeURIComponent(commentId)}`;
}

/**
 * Says something on an item, optionally pinned to a moment in a video.
 *
 * `atSeconds` goes as the float the scrubber produced: rounding it would move
 * the mark (`items.md` § `POST /api/items/:itemId/comments`).
 */
export function createComment(
  options: Readonly<{ itemId: string; body: CreateCommentRequest }>,
): Promise<CommentDto> {
  return apiFetch({
    path: `${makeItemPathFromItemId(options.itemId)}/comments`,
    schema: commentDtoSchema,
    init: jsonInit({ method: "POST", body: options.body }),
  });
}

/** Edits the body. A pin cannot move, so the body is all there is. */
export function updateComment(
  options: Readonly<{ commentId: string; body: UpdateCommentRequest }>,
): Promise<CommentDto> {
  return apiFetch({
    path: _commentPath(options.commentId),
    schema: commentDtoSchema,
    init: jsonInit({ method: "PATCH", body: options.body }),
  });
}

/** Takes a comment down, with its reactions. Answers `204`. */
export function deleteComment(commentId: string): Promise<void> {
  return apiFetch({
    path: _commentPath(commentId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}
