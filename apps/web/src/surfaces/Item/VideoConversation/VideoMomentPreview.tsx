import { ActionIcon, UnstyledButton } from "@mantine/core";
import { IconPlayerPlayFilled, IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { VideoReaction } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import {
  videoMomentLabel,
  type VideoMoment,
} from "./videoMomentHelpers/videoMomentHelpers";
import classes from "./VideoConversation.module.css";

type Props = {
  moment: VideoMoment;
  onSeek: (seconds: number) => void;
  onRemove: (reaction: VideoReaction) => void;
  onClose: () => void;
};

/** One author and moment, with readable content and separate playback actions. */
export function VideoMomentPreview({
  moment,
  onSeek,
  onRemove,
  onClose,
}: Readonly<Props>): ReactNode {
  return (
    <li className={classes.momentRow}>
      <div className={classes.momentHeader}>
        <span
          aria-hidden="true"
          className={
            moment.reaction === undefined
              ? classes.momentAvatar
              : classes.momentEmoji
          }
        >
          {moment.glyph}
        </span>
        <div className={classes.momentIdentity}>
          <span className={classes.momentAuthor}>{moment.authorName}</span>
          {moment.reaction ? (
            <span className={classes.momentKind}>
              Reacted {moment.reaction.emoji}
            </span>
          ) : null}
        </div>
        {_timestamp(moment, onSeek, onClose)}
        {_removeReaction(moment.reaction, onRemove, onClose)}
      </div>
      {moment.body !== undefined ? (
        <p className={classes.momentBody}>{moment.body}</p>
      ) : null}
    </li>
  );
}

function _timestamp(
  moment: Readonly<VideoMoment>,
  onSeek: Props["onSeek"],
  onClose: Props["onClose"],
): ReactNode {
  return (
    <UnstyledButton
      className={classes.momentTimestamp}
      aria-label={videoMomentLabel(moment)}
      onClick={() => {
        onSeek(moment.atSeconds);
        onClose();
      }}
    >
      <IconPlayerPlayFilled size={12} aria-hidden="true" />
      {clockLabel(moment.atSeconds)}
    </UnstyledButton>
  );
}

function _removeReaction(
  reaction: VideoReaction | undefined,
  onRemove: Props["onRemove"],
  onClose: Props["onClose"],
): ReactNode {
  if (!reaction?.canDelete) {
    return null;
  }
  return (
    <ActionIcon
      className={classes.removeMoment}
      aria-label={`Remove ${reaction.emoji} reaction at ${clockLabel(reaction.atSeconds)}`}
      onClick={() => {
        onRemove(reaction);
        onClose();
      }}
    >
      <IconTrash size={18} aria-hidden="true" />
    </ActionIcon>
  );
}
