import { z } from "zod";
import { commentTagInputSchema, idSchema, reactionKindSchema } from "./dtos.ts";
import { makeNormalizedCommentFromDraft } from "./commentTags/commentTags.ts";

/**
 * The bodies the conversation routes take: `tech-specs/apis/items.md`
 * § Comments and § Reactions.
 *
 * Every one of them is trimmed before it is measured. A comment of four
 * thousand spaces is not a long comment, it is an empty one.
 */

/** Joint normalization keeps UTF-16 ranges aligned with trimmed text. */
function _makeNormalizedCommentFromDraft<
  T extends {
    body: string;
    commentTags?: Array<z.infer<typeof commentTagInputSchema>>;
  },
>(draft: T, context: z.RefinementCtx): T {
  try {
    const normalized = makeNormalizedCommentFromDraft({
      body: draft.body,
      commentTags: draft.commentTags ?? [],
    });
    return {
      ...draft,
      body: normalized.body,
      ...(draft.commentTags === undefined
        ? {}
        : { commentTags: normalized.commentTags }),
    };
  } catch {
    context.addIssue({
      code: "custom",
      message: "Invalid comment body or tag ranges",
    });
    return z.NEVER;
  }
}

/**
 * Say something, optionally pinned to a moment in a video.
 *
 * `atSeconds` is a float rather than an integer, because the scrubber
 * produces `fraction * duration`: rounding it to a whole second would move
 * everybody's mark. The upper bound is not here, because it is
 * `items.duration_ms` on another row, and the handler clamps rather than
 * rejects: `fraction === 1` produces exactly the duration and a float a hair
 * over it is arithmetic, not a bad request.
 */
export const createCommentRequestSchema = z
  .object({
    body: z.string(),
    commentTags: z.array(commentTagInputSchema).default([]),
    /** Replies inherit the parent comment’s moment. */
    parentCommentId: idSchema.nullish(),
    atSeconds: z.number().nonnegative().nullish(),
  })
  .transform(_makeNormalizedCommentFromDraft);

/** Say something, optionally pinned to a moment in a video. */
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

/**
 * Edit the body and its explicit member occurrences.
 *
 * **`atSeconds` is deliberately absent.** A pin is fixed at creation; moving
 * it would slide a mark under everybody else reading the same transport bar.
 * The schema strips it rather than rejecting the request, so a client
 * sending the whole comment back does not fail on a field it merely echoed.
 */
export const updateCommentRequestSchema = z
  .object({
    body: z.string(),
    commentTags: z.array(commentTagInputSchema).optional(),
  })
  .transform(_makeNormalizedCommentFromDraft);

/** Edit the body and its explicit member occurrences. */
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;

/** Set or change my reaction, on an item or on a comment. */
export const setReactionRequestSchema = z.object({ kind: reactionKindSchema });

/** Set or change my reaction, on an item or on a comment. */
export type SetReactionRequest = z.infer<typeof setReactionRequestSchema>;
