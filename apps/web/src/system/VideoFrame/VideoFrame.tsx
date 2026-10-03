import { clamp } from "@mantine/hooks";
import { useState, type RefObject, type ReactNode } from "react";
import type { MediaRef } from "@memory-shoebox/shared";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { TransportMarks } from "@/system/VideoFrame/TransportMarks";
import { TransportPlay } from "@/system/VideoFrame/TransportPlay";
import { TransportSlider } from "@/system/VideoFrame/TransportSlider";
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

/** The two encodings the contract carries, in preference order. */
function _sourcesOf(
  media: MediaRef,
): ReadonlyArray<{ readonly url: string; readonly type: string }> {
  if (media.video === null) {
    return [];
  }
  return [
    { source: media.video.webm, type: "video/webm" },
    { source: media.video.mp4, type: "video/mp4" },
  ].flatMap((candidate) => {
    return candidate.source === null
      ? []
      : [{ url: candidate.source.url, type: candidate.type }];
  });
}

/**
 * A video in its frame, standing on a measured transport bar.
 *
 * **The duration is the contract's.** `media.durationMs` is non-null for every
 * video (`items.md` transformation 4), so every mark lands where it belongs on
 * first paint instead of jumping once metadata loads; the element's own
 * duration is the fallback for a payload that somehow lacks it.
 */
export function VideoFrame({
  media,
  marks,
  pendingAt,
  videoRef,
  position,
  onPositionChange,
  onScrub,
}: Readonly<Props>): ReactNode {
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const duration =
    media.durationMs === null ? loadedDuration : media.durationMs / 1000;

  // The clock never reads past either end of the video.
  const shownPosition = clamp(position, 0, duration);

  const seekTo = (seconds: number): number => {
    const clamped = clamp(seconds, 0, duration);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    onPositionChange(clamped);
    return clamped;
  };

  return (
    <div className={classes.frame}>
      <video
        ref={videoRef}
        // The composed alt text, as a photograph's `<img>` carries it, so a
        // screen reader hears who is in the video rather than nothing.
        aria-label={media.altText}
        poster={media.poster?.url}
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          setLoadedDuration(Number.isFinite(seconds) ? seconds : 0);
        }}
        onTimeUpdate={(event) => {
          return onPositionChange(event.currentTarget.currentTime);
        }}
        onPlay={() => {
          return setIsPlaying(true);
        }}
        onPause={() => {
          return setIsPlaying(false);
        }}
      >
        {_sourcesOf(media).map((source) => {
          return (
            <source key={source.url} src={source.url} type={source.type} />
          );
        })}
      </video>
      <div className={classes.transport}>
        <TransportPlay videoRef={videoRef} isPlaying={isPlaying} />
        <span className={classes.transportClock}>
          {clockLabel(shownPosition)} / {clockLabel(duration)}
        </span>
        <div className={classes.scrubber}>
          <TransportSlider
            position={position}
            duration={duration}
            onSeek={(seconds) => {
              // Seek first: `onScrub?.(seekTo(...))` would skip the seek
              // itself whenever nobody is listening for scrubs.
              const scrubbedTo = seekTo(seconds);
              onScrub?.(scrubbedTo);
            }}
          />
          <TransportMarks
            marks={marks}
            pendingAt={pendingAt}
            duration={duration}
            onSeek={seekTo}
          />
        </div>
      </div>
    </div>
  );
}
