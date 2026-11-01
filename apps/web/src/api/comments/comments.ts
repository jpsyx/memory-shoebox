import {
  ApiRequestError,
  apiFetch,
  jsonInit,
} from "@/api/clientHelpers/clientHelpers";
import { makeItemPathFromItemId } from "@/api/items/items";
import {
  commentDtoSchema,
  type CommentDto,
  type CommentTagInput,
  type CreateCommentRequest,
  type UpdateCommentRequest,
} from "@memory-shoebox/shared";
import { z } from "zod";

/** The exact path one comment lives at, below `/api`. */
export function makeCommentPathFromCommentId(commentId: string): string {
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
    path: makeCommentPathFromCommentId(options.commentId),
    schema: commentDtoSchema,
    init: jsonInit({ method: "PATCH", body: options.body }),
  });
}

/** Takes a comment down, with its reactions. Answers `204`. */
export function deleteComment(commentId: string): Promise<void> {
  return apiFetch({
    path: makeCommentPathFromCommentId(commentId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}

/** A recoverable member occurrence refusal, tied to its submitted wording. */
export type CommentTagFailure = {
  occurrence: CommentTagInput;
  memberId: string;
  label: string;
  code: "comment_tag_stale" | "comment_tag_unavailable";
};

/** Extracts structured tag refusals without using server prose as UI copy. */
export function getCommentTagFailuresFromError(
  error: unknown,
  draft:
    | Readonly<{
        body: string;
        commentTags: readonly CommentTagInput[];
      }>
    | undefined,
): CommentTagFailure[] {
  if (!(error instanceof ApiRequestError) || !draft) {
    return [];
  }
  return Object.entries(error.details?.fieldErrors ?? {}).flatMap(
    ([field, codes]) => {
      const match = /^commentTags\.(\d+)$/.exec(field);
      const tag = match ? draft.commentTags[Number(match[1])] : undefined;
      const code = codes[0];
      if (
        !tag ||
        (code !== "comment_tag_stale" && code !== "comment_tag_unavailable")
      ) {
        return [];
      }
      return [
        {
          occurrence: tag,
          memberId: tag.memberId,
          label: draft.body.slice(tag.start + 1, tag.end),
          code,
        },
      ];
    },
  );
}

/**
 * Matches refused wording to still-present references after intervening
 * edits.
 */
export function getFailedCommentTagsFromDraft(
  options: Readonly<{
    draft: {
      body: string;
      commentTags: readonly CommentTagInput[];
    };
    failures: readonly CommentTagFailure[];
  }>,
): Array<{ index: number; failure: CommentTagFailure }> {
  return options.draft.commentTags.flatMap((tag, index) => {
    const failure = options.failures.find((candidate) => {
      return (
        candidate.occurrence === tag &&
        candidate.memberId === tag.memberId &&
        candidate.label === options.draft.body.slice(tag.start + 1, tag.end)
      );
    });
    return failure ? [{ index, failure }] : [];
  });
}
