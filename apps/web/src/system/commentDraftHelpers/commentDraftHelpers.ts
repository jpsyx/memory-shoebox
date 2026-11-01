import type { CommentTagInput, MemberRef } from "@memory-shoebox/shared";
import { makeCommentTagFromSource } from "./commentTagProvenance";
/** Words and only the member references explicitly selected by their author. */
export type CommentDraft = { body: string; commentTags: CommentTagInput[] };
/**
 * Applies one native text replacement while retaining unaffected references.
 */
export function makeCommentDraftFromEdit(
  options: Readonly<{
    draft: CommentDraft;
    start: number;
    end: number;
    text: string;
  }>,
): CommentDraft {
  const { draft, start, end, text } = options;
  const offset = text.length - (end - start);
  return {
    body: `${draft.body.slice(0, start)}${text}${draft.body.slice(end)}`,
    commentTags: draft.commentTags.flatMap((tag) => {
      if (tag.end <= start) {
        return [tag];
      }
      if (tag.start >= end) {
        return offset === 0
          ? [tag]
          : [
              makeCommentTagFromSource({
                source: tag,
                changes: { start: tag.start + offset, end: tag.end + offset },
              }),
            ];
      }
      return [];
    }),
  };
}
/**
 * Inserts one explicit member selection, leaving a space for continued
 * typing.
 */
export function makeCommentDraftFromMemberSelection(
  options: Readonly<{
    draft: CommentDraft;
    start: number;
    end: number;
    member: MemberRef;
  }>,
): CommentDraft {
  const { member, start } = options;
  const text = `@${member.displayName} `;
  const edited = makeCommentDraftFromEdit({ ...options, text });
  return {
    ...edited,
    commentTags: [
      ...edited.commentTags,
      { memberId: member.memberId, start, end: start + text.length - 1 },
    ].sort((left, right) => {
      return left.start - right.start;
    }),
  };
}
/** Gets a bounded, currently active member query from the caret. */
export function getCommentTagQueryFromSelection(
  options: Readonly<{
    body: string;
    commentTags: readonly CommentTagInput[];
    start: number;
    end: number;
  }>,
): { start: number; end: number; query: string } | undefined {
  const { body, start, end, commentTags } = options;
  if (
    start !== end ||
    commentTags.some((tag) => {
      return start > tag.start && start <= tag.end;
    })
  ) {
    return undefined;
  }
  const match = /(?:^|[\s([{“"'])@([^@\n\r]*)$/u.exec(body.slice(0, start));
  if (!match || match[1] === undefined || match[1].length > 80) {
    return undefined;
  }
  const queryStart = start - match[1].length - 1;
  if (
    commentTags.some((tag) => {
      return tag.start >= queryStart && tag.start < start;
    })
  ) {
    return undefined;
  }
  return { start: queryStart, end: start, query: match[1] };
}
