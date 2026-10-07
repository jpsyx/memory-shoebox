import { Popover } from "@mantine/core";
import { IconMessageCircle, IconMoodSmile } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { VideoReactionEmoji } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import type { VideoReactionsState } from "./useVideoReactions/useVideoReactions";
import classes from "./VideoConversation.module.css";

type Props = {
  reactions: VideoReactionsState;
  position: number;
  canReact: boolean;
  onComment: () => void;
};
const CHOICES: Array<{ emoji: VideoReactionEmoji; label: string }> = [
  { emoji: "😂", label: "Laugh" },
  { emoji: "😍", label: "Love it" },
  { emoji: "😮", label: "Wow" },
  { emoji: "🙌", label: "Celebrate" },
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "👏", label: "Applause" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "🥹", label: "Touched" },
  { emoji: "🎉", label: "Party" },
  { emoji: "💯", label: "Perfect" },
];

/** Quick reactions write a new event at the current playback position. */
export function VideoReactionBar({
  reactions,
  position,
  canReact,
  onComment,
}: Readonly<Props>): ReactNode {
  const choice = ({
    emoji,
    label,
  }: {
    emoji: VideoReactionEmoji;
    label: string;
  }) => {
    return (
      <button
        className={classes.emojiButton}
        key={emoji}
        type="button"
        aria-label={`React: ${label}`}
        title={`${label} at ${clockLabel(position)}`}
        disabled={
          !canReact ||
          reactions.isLoading ||
          reactions.readError !== undefined ||
          reactions.isSending ||
          reactions.writeError !== undefined
        }
        onClick={() => {
          reactions.react({ emoji, atSeconds: position });
        }}
      >
        {emoji}
      </button>
    );
  };
  return (
    <div className={classes.reactionArea}>
      <div
        className={classes.reactionBar}
        role="group"
        aria-label="React to this moment"
      >
        {CHOICES.slice(0, 6).map(choice)}
        <Popover position="top" withinPortal>
          <Popover.Target>
            <button
              className={classes.moreButton}
              type="button"
              aria-label="More reactions"
            >
              <IconMoodSmile size={22} />
            </button>
          </Popover.Target>
          <Popover.Dropdown className={classes.momentPopover}>
            {CHOICES.slice(6).map(choice)}
          </Popover.Dropdown>
        </Popover>
        <button
          className={classes.commentAction}
          type="button"
          aria-label="Comment on this moment"
          onClick={onComment}
        >
          <IconMessageCircle size={19} />
          <span>Comment</span>
        </button>
      </div>
      <p className={classes.reactionHint}>
        React to this moment <span>·</span> {clockLabel(position)}
      </p>
      {reactions.isLoading ? (
        <p role="status" className={classes.reactionHint}>
          Loading reactions…
        </p>
      ) : null}
      {reactions.readError === undefined ? null : (
        <p className={classes.error} role="alert">
          Reactions couldn’t load.{" "}
          <button type="button" onClick={reactions.refresh}>
            Try again
          </button>
        </p>
      )}
      {reactions.writeError === undefined ? null : (
        <p className={classes.error} role="alert">
          That reaction couldn’t be saved.{" "}
          <button
            type="button"
            onClick={reactions.retry}
            disabled={reactions.isSending}
          >
            Retry reaction
          </button>{" "}
          <button type="button" onClick={reactions.dismiss}>
            Dismiss
          </button>
        </p>
      )}
      <span className="visually-hidden" role="status">
        {reactions.lastAdded === undefined
          ? ""
          : `Reaction ${reactions.lastAdded.emoji} added at ${clockLabel(reactions.lastAdded.atSeconds)}`}
      </span>
    </div>
  );
}
