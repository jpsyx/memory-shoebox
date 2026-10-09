import { useRef, useState, type RefObject } from "react";
import { playVideo } from "@/system/VideoFrame/playVideo";

/** Where the video stands, and the pin being placed on it. */
export type VideoTransport = {
  videoRef: RefObject<HTMLVideoElement | null>;
  position: number;
  setPosition: (seconds: number) => void;
  /** The moment a comment being written will stand at, if one is set. */
  pendingAt: number | undefined;
  setPendingAt: (seconds: number | undefined) => void;
  /** Explicitly starts playback at a moment; ordinary seeking preserves state. */
  seekAndPlay: (seconds: number) => void;
};

/**
 * The transport's state, held above both columns: the left one draws the bar
 * and the pin button, the right one the composer and the stamps.
 *
 * A different item starts at its beginning with nothing pinned.
 */
export function useVideoTransport(itemId: string): VideoTransport {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState(0);
  const [pendingAt, setPendingAt] = useState<number | undefined>(undefined);
  const [transportItemId, setTransportItemId] = useState(itemId);
  // The page is not remounted between items, so the reset happens here,
  // adjusted during render rather than in an effect.
  if (transportItemId !== itemId) {
    setTransportItemId(itemId);
    setPosition(0);
    setPendingAt(undefined);
  }
  return {
    videoRef,
    position,
    setPosition,
    pendingAt,
    setPendingAt,
    seekAndPlay: (seconds) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = seconds;
        playVideo(video);
      }
      setPosition(seconds);
    },
  };
}
