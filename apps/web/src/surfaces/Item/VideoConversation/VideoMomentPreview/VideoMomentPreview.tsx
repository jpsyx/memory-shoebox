import { ActionIcon, UnstyledButton } from "@mantine/core";
import { IconPlayerPlayFilled, IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { VideoReaction } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import {
  videoMomentLabel,
  type VideoMoment,
} from "../videoMomentHelpers/videoMomentHelpers";
import classes from "./VideoMomentPreview.module.css";

type Props = {
  moment: VideoMoment;
  onSeek: (seconds: number) => void;
  onRemove: (reaction: VideoReaction) => void;
  onClose: () => void;
};

/**
 * One author and moment, with readable content and separate playback actions.
 */
export function VideoMomentPreview({
  moment,
  onSeek,
  onRemove,
  onClose,
}: Readonly<Props>): ReactNode {
  return (
    <li className={classes.videoMomentPreview}>
      <div className={classes.videoMomentPreviewHeader}>
        <span
          aria-hidden="true"
          className={
            moment.reaction === undefined
              ? classes.videoMomentPreviewAvatar
              : classes.videoMomentPreviewEmoji
          }
        >
          {moment.glyph}
        </span>
        <div className={classes.videoMomentPreviewIdentity}>
          <span className={classes.videoMomentPreviewAuthor}>
            {moment.authorName}
          </span>
          {moment.reaction ? (
            <span className={classes.videoMomentPreviewKind}>
              Reacted {moment.reaction.emoji}
            </span>
          ) : null}
        </div>
        {_timestamp(moment, onSeek, onClose)}
        {_removeReaction(moment.reaction, onRemove, onClose)}
      </div>
      {moment.body !== undefined ? (
        <p className={classes.videoMomentPreviewBody}>{moment.body}</p>
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
      className={classes.videoMomentPreviewTimestamp}
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
      className={classes.videoMomentPreviewRemoveReaction}
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
