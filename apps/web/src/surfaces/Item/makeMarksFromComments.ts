import type { CommentDto } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import type { TransportMark } from "@/system/VideoFrame/VideoFrame";

/**
 * One mark on the scrubber per comment pinned to a moment, each named for a
 * screen reader by who said it and when, because the mark itself is a 3px
 * line.
 */
export function makeMarksFromComments(
  comments: readonly CommentDto[],
): TransportMark[] {
  return comments.flatMap((comment) => {
    return comment.atSeconds === null
      ? []
      : [
          {
            id: comment.commentId,
            atSeconds: comment.atSeconds,
            label: `Jump to ${comment.author.displayName}'s comment at ${clockLabel(comment.atSeconds)}`,
          },
        ];
  });
}
