import type { ReactNode } from "react";
import type { VideoReaction } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import type { VideoMomentGroup } from "./videoMomentHelpers/videoMomentHelpers";
import { VideoMomentPreview } from "./VideoMomentPreview";
import classes from "./VideoConversation.module.css";

type Props = {
  group: VideoMomentGroup;
  onSeek: (seconds: number) => void;
  onRemove: (reaction: VideoReaction) => void;
  onClose: () => void;
};

/** A scrollable conversation list keeps dense timeline groups usable. */
export function VideoMomentList({
  group,
  ...actions
}: Readonly<Props>): ReactNode {
  return (
    <ul
      aria-label={`Moments near ${clockLabel(group.atSeconds)}`}
      className={classes.momentList}
    >
      {group.moments.map((moment) => {
        return (
          <VideoMomentPreview key={moment.id} moment={moment} {...actions} />
        );
      })}
    </ul>
  );
}
