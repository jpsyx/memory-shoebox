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
 * A pinned comment carries a stamp that seeks the video instead of a plain
 * time, and the words a sighted reader gets from position ("this one jumps
 * to Abuela's comment") are carried for a screen reader in hidden text.
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
      <span className="visually-hidden">
        {` Jump to ${comment.author.displayName}'s comment`}
      </span>
    </button>
  );
}
