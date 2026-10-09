import { Popover } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { VideoReaction } from "@memory-shoebox/shared";
import type { VideoMomentGroup } from "./videoMomentHelpers/videoMomentHelpers";
import { VideoMomentTrigger } from "./VideoMomentTrigger";
import { VideoMomentList } from "./VideoMomentList";
import classes from "./VideoConversation.module.css";

type Props = {
  group: VideoMomentGroup;
  onSeek: (seconds: number) => void;
  onRemove: (reaction: VideoReaction) => void;
};

/** Every timeline moment opens its conversation, including single comments. */
export function VideoMomentMarker({
  group,
  onSeek,
  onRemove,
}: Readonly<Props>): ReactNode {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top"
      width="min(22rem, calc(100vw - 2rem))"
      withinPortal={false}
      floatingStrategy="fixed"
      withArrow
      trapFocus
      returnFocus
      middlewares={{ shift: { padding: 16 }, size: { padding: 16 } }}
    >
      <Popover.Target>
        <VideoMomentTrigger
          group={group}
          opened={opened}
          onClick={(event) => {
            event.currentTarget.focus();
            if (group.moments.length === 1 && !opened) {
              onSeek(group.moments[0]!.atSeconds);
            }
            setOpened(!opened);
          }}
        />
      </Popover.Target>
      <Popover.Dropdown className={classes.momentPopover}>
        <VideoMomentList
          group={group}
          onSeek={onSeek}
          onRemove={onRemove}
          onClose={() => {
            setOpened(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
