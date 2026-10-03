import type { ReactNode } from "react";
import type { CommentDto } from "@memory-shoebox/shared";
import { agoLabel, clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  comment: CommentDto;
  onSeek?: (seconds: number) => void;
};

/**
 * When a comment was said, or the moment it is pinned to.
 *
 * A pinned comment carries a stamp instead of a plain time, which plays the
 * video from that moment. A sighted reader has the play glyph to say so; a
 * screen reader gets the same in hidden text. Who said it is already read
 * out beside it, and is the mark's name on the scrubber, so it is not
 * repeated here.
 */
export function CommentWhen({ comment, onSeek }: Readonly<Props>): ReactNode {
  const pinnedAt = comment.atSeconds;
  if (pinnedAt === null) {
    return (
      <span className={classes.commentWhen}>
        {agoLabel({ timestamp: comment.createdAt })}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes.stamp}
      onClick={() => {
        return onSeek?.(pinnedAt);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
      {clockLabel(pinnedAt)}
      {/* The space stands outside the hidden words, because a name is
          worked out from each element's own text trimmed, which would
          read "0:11Play". */}{" "}
      <span className="visually-hidden">Play the video from here</span>
    </button>
  );
}
