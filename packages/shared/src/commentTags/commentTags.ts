import { z } from "zod";
import {
  commentTagInputSchema,
  memberRefSchema,
  type CommentTagInput,
} from "../dtos.ts";
import { LIMITS } from "../limits.ts";

function _isSurrogateBoundary(body: string, offset: number): boolean {
  const before = body.charCodeAt(offset - 1);
  const after = body.charCodeAt(offset);
  return (
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
  );
}

function _getValidatedTagsFromDraft(
  options: Readonly<{
    body: string;
    commentTags: readonly CommentTagInput[];
  }>,
): CommentTagInput[] {
  const retainedIds = new Set<string>();
  let previousEnd = 0;
  return options.commentTags.map((input) => {
    const tag = commentTagInputSchema.parse(input);
    if (
      tag.start < previousEnd ||
      tag.end > options.body.length ||
      _isSurrogateBoundary(options.body, tag.start) ||
      _isSurrogateBoundary(options.body, tag.end) ||
      (tag.tagId !== undefined && retainedIds.has(tag.tagId))
    ) {
      throw new Error("Invalid comment tag range or retained ID");
    }
    previousEnd = tag.end;
    if (tag.tagId !== undefined) {
      retainedIds.add(tag.tagId);
    }
    return tag;
  });
}

/** Validates raw UTF-16 ranges, then trims text and shifts ranges together. */
export function makeNormalizedCommentFromDraft(
  options: Readonly<{
    body: string;
    commentTags: readonly CommentTagInput[];
  }>,
): { body: string; commentTags: CommentTagInput[] } {
  const rawTags = _getValidatedTagsFromDraft(options);
  const body = options.body.trim();
  if (body.length === 0 || body.length > LIMITS.freeTextMaxLength) {
    throw new Error("Comment must contain between 1 and 4000 UTF-16 units");
  }
  const leadingLength = options.body.length - options.body.trimStart().length;
  const trimmedEnd = leadingLength + body.length;
  const commentTags = rawTags.map((tag) => {
    if (tag.start < leadingLength || tag.end > trimmedEnd) {
      throw new Error("Comment tags cannot include trimmed whitespace");
    }
    return {
      ...tag,
      start: tag.start - leadingLength,
      end: tag.end - leadingLength,
    };
  });
  return { body, commentTags };
}

/** An optional name query for the complete, small family directory. */
export const commentTagCandidatesQuerySchema = z.object({
  q: z.string().max(80).default(""),
});

/** Only public member references, never membership status or email preferences. */
export const commentTagCandidatesResponseSchema = z.object({
  members: z.array(memberRefSchema),
});

/** Validated candidate-search parameters. */
export type CommentTagCandidatesQuery = z.infer<
  typeof commentTagCandidatesQuerySchema
>;

/** Eligible public account references for one visible item. */
export type CommentTagCandidatesResponse = z.infer<
  typeof commentTagCandidatesResponseSchema
>;
