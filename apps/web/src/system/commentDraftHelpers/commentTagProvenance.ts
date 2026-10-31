import type { CommentTag, CommentTagInput } from "@memory-shoebox/shared";
import type { CommentDraft } from "./commentDraftHelpers";
const SOURCE: unique symbol = Symbol("comment occurrence source");
type Occurrence = CommentTagInput & { [SOURCE]?: CommentTagInput };
/** The original selected occurrence, independent of its current offsets. */
export function getSourceFromCommentTag(
  tag: Readonly<Occurrence>,
): CommentTagInput {
  return tag[SOURCE] ?? tag;
}
/** Derives range or saved-ID metadata without mutating the source occurrence. */
export function makeCommentTagFromSource(
  options: Readonly<{
    source: CommentTagInput;
    changes: Partial<Pick<CommentTagInput, "start" | "end" | "tagId">>;
  }>,
): CommentTagInput {
  return Object.defineProperty(
    { ...options.source, ...options.changes },
    SOURCE,
    { value: getSourceFromCommentTag(options.source) },
  );
}
/** Records only server occurrences that correspond exactly to this submission. */
export function recordSavedCommentTagIdsInPlace(
  options: Readonly<{
    submitted: CommentDraft;
    savedTags: readonly CommentTag[];
    tagIds: WeakMap<CommentTagInput, string>;
  }>,
): void {
  const leading =
    options.submitted.body.length - options.submitted.body.trimStart().length;
  options.submitted.commentTags.forEach((tag, index) => {
    const saved = options.savedTags[index];
    if (
      saved &&
      saved.memberId === tag.memberId &&
      saved.start === tag.start - leading &&
      saved.end === tag.end - leading &&
      saved.label === options.submitted.body.slice(tag.start + 1, tag.end) &&
      (tag.tagId === undefined || tag.tagId === saved.tagId)
    ) {
      options.tagIds.set(getSourceFromCommentTag(tag), saved.tagId);
    }
  });
}
/** Adds acknowledged IDs only to surviving provenance, keeping current words. */
export function makeCommentDraftFromSavedTagIds(
  options: Readonly<{
    draft: CommentDraft;
    tagIds: WeakMap<CommentTagInput, string>;
  }>,
): CommentDraft {
  let hasChanges = false;
  const commentTags = options.draft.commentTags.map((tag) => {
    const tagId = options.tagIds.get(getSourceFromCommentTag(tag));
    if (tagId === undefined || tag.tagId === tagId) {
      return tag;
    }
    hasChanges = true;
    return makeCommentTagFromSource({ source: tag, changes: { tagId } });
  });
  return hasChanges ? { ...options.draft, commentTags } : options.draft;
}
/** Distinguishes metadata-only acknowledgements from external draft replacement. */
export function hasSameCommentDraftOccurrences(
  left: Readonly<CommentDraft>,
  right: Readonly<CommentDraft>,
): boolean {
  return (
    left.body === right.body &&
    left.commentTags.length === right.commentTags.length &&
    left.commentTags.every((tag, index) => {
      const other = right.commentTags[index];
      return (
        other !== undefined &&
        getSourceFromCommentTag(tag) === getSourceFromCommentTag(other) &&
        tag.memberId === other.memberId &&
        tag.start === other.start &&
        tag.end === other.end
      );
    })
  );
}
