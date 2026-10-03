import { clamp } from "@mantine/hooks";
import { useState, type RefObject } from "react";
import type { MediaRef } from "@memory-shoebox/shared";

/** The video's length, where the clock stands in it, and how to move it. */
export type VideoSeek = {
  /** In seconds; zero until something says how long the video is. */
  duration: number;
  /** The caller's position, never past either end of the video. */
  shownPosition: number;
  /** Moves the video and the caller to `seconds`, kept inside the video. */
  seekTo: (seconds: number) => number;
  /** The element's own duration, for a payload that lacks the contract's. */
  onDurationLoad: (seconds: number) => void;
};

/** What seeking needs: the video, and the position its caller holds. */
export type VideoSeekOptions = {
  media: MediaRef;
  videoRef: RefObject<HTMLVideoElement | null>;
  position: number;
  onPositionChange: (seconds: number) => void;
};

/**
 * A video's duration and seeking.
 *
 * **The duration is the contract's.** `media.durationMs` is non-null for every
 * video (`items.md` transformation 4), so every mark lands where it belongs on
 * first paint instead of jumping once metadata loads; the element's own
 * duration is the fallback for a payload that somehow lacks it.
 */
export function useVideoSeek(options: Readonly<VideoSeekOptions>): VideoSeek {
  const { media, videoRef, position, onPositionChange } = options;
  const [loadedDuration, setLoadedDuration] = useState(0);
  const duration =
    media.durationMs === null ? loadedDuration : media.durationMs / 1000;
  return {
    duration,
    shownPosition: clamp(position, 0, duration),
    seekTo: (seconds) => {
      const clamped = clamp(seconds, 0, duration);
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
      onPositionChange(clamped);
      return clamped;
    },
    onDurationLoad: (seconds) => {
      setLoadedDuration(Number.isFinite(seconds) ? seconds : 0);
    },
  };
}
