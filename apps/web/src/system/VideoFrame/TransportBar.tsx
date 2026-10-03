import type { ReactNode, RefObject } from "react";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { TransportMarks } from "@/system/VideoFrame/TransportMarks/TransportMarks";
import { TransportPlay } from "@/system/VideoFrame/TransportPlay";
import { TransportSlider } from "@/system/VideoFrame/TransportSlider/TransportSlider";
import type { VideoSeek } from "@/system/VideoFrame/useVideoSeek";
import type { TransportMark } from "@/system/VideoFrame/VideoFrame";
import classes from "@/system/system.module.css";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  seek: VideoSeek;
  /** Where the transport stands, in seconds, as the caller holds it. */
  position: number;
  marks: readonly TransportMark[];
  pendingAt?: number;
  /** A position chosen on the bar itself, by a press or a key. */
  onScrub?: (seconds: number) => void;
};

/** Play, the clock, and the bar with its marks, under the video. */
export function TransportBar({
  videoRef,
  isPlaying,
  seek,
  position,
  marks,
  pendingAt,
  onScrub,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.transport}>
      <TransportPlay videoRef={videoRef} isPlaying={isPlaying} />
      <span className={classes.transportClock}>
        {clockLabel(seek.shownPosition)} / {clockLabel(seek.duration)}
      </span>
      <div className={classes.scrubber}>
        <TransportSlider
          position={position}
          duration={seek.duration}
          onSeek={(seconds) => {
            // Seek first: `onScrub?.(seekTo(...))` would skip the seek itself
            // whenever nobody is listening for scrubs.
            const scrubbedTo = seek.seekTo(seconds);
            onScrub?.(scrubbedTo);
          }}
        />
        <TransportMarks
          marks={marks}
          pendingAt={pendingAt}
          duration={seek.duration}
          onSeek={seek.seekTo}
        />
      </div>
    </div>
  );
}
