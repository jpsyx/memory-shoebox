import type { ReactNode } from "react";
import type { VideoReactionEmoji } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import type { VideoReactionsState } from "./useVideoReactions/useVideoReactions";
import { MediaReactionBar } from "@/system/MediaReactionBar/MediaReactionBar";
import classes from "../ItemConversation/ItemConversation.module.css";

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
  return (
    <MediaReactionBar
      choices={CHOICES.map((choice) => {
        return {
          ...choice,
          value: choice.emoji,
          title: `${choice.label} at ${clockLabel(position)}`,
        };
      })}
      label="React to this moment"
      commentLabel="Comment on this moment"
      onReact={(emoji) => {
        reactions.react({ emoji, atSeconds: position });
      }}
      onComment={onComment}
      disabled={
        !canReact ||
        reactions.isLoading ||
        reactions.readError !== undefined ||
        reactions.isSending ||
        reactions.writeError !== undefined
      }
      hint={
        <>
          React to this moment <span>·</span> {clockLabel(position)}
        </>
      }
    >
      {reactions.isLoading ? <p role="status">Loading reactions…</p> : null}
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
    </MediaReactionBar>
  );
}
