import type { ReactNode, RefObject } from "react";
import { PlayGlyph } from "@/system/icons";
import { playVideo } from "@/system/VideoFrame/playVideo";
import classes from "@/system/system.module.css";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
};

/** The square play button: Play while paused, Pause while playing. */
export function TransportPlay({
  videoRef,
  isPlaying,
}: Readonly<Props>): ReactNode {
  return (
    <button
      type="button"
      className={classes.transportPlay}
      aria-label={isPlaying ? "Pause" : "Play"}
      onClick={() => {
        const video = videoRef.current;
        if (!video) {
          return;
        }
        if (video.paused) {
          playVideo(video);
        } else {
          video.pause();
        }
      }}
    >
      <PlayGlyph paused={!isPlaying} />
    </button>
  );
}
