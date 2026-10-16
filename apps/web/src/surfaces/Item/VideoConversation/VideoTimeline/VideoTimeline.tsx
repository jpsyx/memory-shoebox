import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { useElementSize } from "@mantine/hooks";
import type { CommentDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { VideoPlayback } from "../useVideoPlayback/useVideoPlayback";
import type { VideoReactionsState } from "../useVideoReactions/useVideoReactions";
import classes from "./VideoTimeline.module.css";
import { makeMomentGroupsFromEvents } from "../videoMomentHelpers/videoMomentHelpers";
import { VideoMomentMarker } from "../VideoMomentMarker/VideoMomentMarker";

type Props = {
  comments: readonly CommentDto[];
  reactions: VideoReactionsState;
  playback: VideoPlayback;
  position: number;
};

/** Timed conversation marks and a precise native keyboard scrubber. */
export function VideoTimeline({
  comments,
  reactions,
  playback,
  position,
}: Readonly<Props>): ReactNode {
  const { duration } = playback;
  const { ref, width } = useElementSize<HTMLDivElement>();
  const groups = makeMomentGroupsFromEvents({
    comments,
    reactions: reactions.reactions,
    duration,
    width,
  });
  return (
    <div className={classes.videoTimeline} ref={ref}>
      <div
        className={classes.videoTimelineMarks}
        aria-label="Moments in this video"
      >
        {groups.map((group) => {
          return (
            <VideoMomentMarker
              key={group.moments[0]!.id}
              group={group}
              onSeek={(seconds) => {
                playback.seek({ seconds: seconds });
              }}
              onRemove={reactions.remove}
            />
          );
        })}
      </div>
      <input
        className={classes.videoTimelineScrubber}
        type="range"
        aria-label="Where in the video"
        aria-valuetext={`${clockLabel(position)} of ${clockLabel(duration)}`}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.min(duration, position)}
        min={0}
        max={duration || 1}
        disabled={duration <= 0}
        step={0.01}
        onKeyDown={(event) => {
          const deltas: Record<string, number> = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowUp: 1,
            ArrowDown: -1,
          };
          const delta = deltas[event.key];
          if (delta !== undefined) {
            event.preventDefault();
            playback.seek({ seconds: position + delta });
          }
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            playback.seek({ seconds: event.key === "Home" ? 0 : duration });
          }
        }}
        value={Math.min(duration, position)}
        onChange={(event) => {
          playback.seek({ seconds: Number(event.currentTarget.value) });
        }}
      />
    </div>
  );
}
