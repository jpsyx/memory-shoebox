import { useState, type RefObject, type ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { TransportBar } from "@/system/VideoFrame/TransportBar";
import { useVideoSeek } from "@/system/VideoFrame/useVideoSeek";
import { VideoElement } from "@/system/VideoFrame/VideoElement";
import classes from "@/system/system.module.css";

/** One pinned comment, as the transport draws it. */
export type TransportMark = {
  readonly id: string;
  readonly atSeconds: number;
  readonly label: string;
};

type Props = {
  media: MediaRef;
  marks: readonly TransportMark[];
  pendingAt?: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * Where the transport stands, in seconds. The caller holds it, because a
   * comment is pinned from it and a video that never loads has no
   * `currentTime` anybody can trust.
   */
  position: number;
  /** Every change of position: playback, the bar, a key, a mark. */
  onPositionChange: (seconds: number) => void;
  /** A position chosen on the bar itself, by a press or a key. */
  onScrub?: (seconds: number) => void;
};

/** A video in its frame, standing on a measured transport bar. */
export function VideoFrame({
  media,
  marks,
  pendingAt,
  videoRef,
  position,
  onPositionChange,
  onScrub,
}: Readonly<Props>): ReactNode {
  const [isPlaying, setIsPlaying] = useState(false);
  const seek = useVideoSeek({ media, videoRef, position, onPositionChange });
  return (
    <div className={classes.frame}>
      <VideoElement
        media={media}
        videoRef={videoRef}
        onDurationLoad={seek.onDurationLoad}
        onPositionChange={onPositionChange}
        onPlayingChange={setIsPlaying}
      />
      <TransportBar
        videoRef={videoRef}
        isPlaying={isPlaying}
        seek={seek}
        position={position}
        marks={marks}
        pendingAt={pendingAt}
        onScrub={onScrub}
      />
    </div>
  );
}
