import { Popover } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { IconTrash } from "@tabler/icons-react";
import type { VideoReaction } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import {
  videoMomentLabel,
  type VideoMomentGroup,
} from "./videoMomentHelpers/videoMomentHelpers";
import classes from "./VideoConversation.module.css";

type Props = {
  group: VideoMomentGroup;
  onSeek: (seconds: number) => void;
  onRemove: (reaction: VideoReaction) => void;
};

/** A keyboard-accessible moment list keeps dense and removable marks usable. */
export function VideoMomentMarker({
  group,
  onSeek,
  onRemove,
}: Readonly<Props>): ReactNode {
  const [opened, setOpened] = useState(false);
  const first = group.moments[0]!;
  const isGroup = group.moments.length > 1;
  const hasMenu = isGroup || first.reaction !== undefined;
  const label = isGroup
    ? `${group.moments.length} moments near ${clockLabel(group.atSeconds)}`
    : videoMomentLabel(first);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top"
      width={280}
      withinPortal={false}
      floatingStrategy="fixed"
      trapFocus
    >
      <Popover.Target>
        <button
          type="button"
          className={
            first.reaction === undefined ? classes.avatarMark : classes.mark
          }
          style={{ left: `${group.leftPercent}%` }}
          aria-label={label}
          onClick={() => {
            if (!isGroup) {
              onSeek(first.atSeconds);
            }
            if (hasMenu) {
              setOpened(!opened);
            }
          }}
        >
          {isGroup
            ? `${first.glyph} +${group.moments.length - 1}`
            : first.glyph}
        </button>
      </Popover.Target>
      <Popover.Dropdown className={classes.momentPopover}>
        <ul
          aria-label={`Moments near ${clockLabel(group.atSeconds)}`}
          className={classes.momentList}
        >
          {group.moments.map((moment) => {
            return (
              <li key={moment.id}>
                <button
                  type="button"
                  aria-label={videoMomentLabel(moment)}
                  onClick={() => {
                    onSeek(moment.atSeconds);
                    setOpened(false);
                  }}
                >
                  <span>{moment.glyph}</span>
                  <span>
                    {moment.label}
                    <b>{clockLabel(moment.atSeconds)}</b>
                  </span>
                </button>
                {moment.reaction?.canDelete ? (
                  <button
                    type="button"
                    aria-label={`Remove ${moment.reaction.emoji} reaction at ${clockLabel(moment.atSeconds)}`}
                    onClick={() => {
                      if (moment.reaction !== undefined) {
                        onRemove(moment.reaction);
                      }
                      setOpened(false);
                    }}
                  >
                    <IconTrash size={17} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Popover.Dropdown>
    </Popover>
  );
}
