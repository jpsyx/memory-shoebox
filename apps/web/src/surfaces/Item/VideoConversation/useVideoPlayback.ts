import { useEffect, useRef, useState } from "react";
import type { MediaRef, VideoReaction } from "@memory-shoebox/shared";
import type { VideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { getCrossedReactions } from "./videoMomentHelpers/videoMomentHelpers";

type Options = {
  media: MediaRef;
  transport: VideoTransport;
  reactions: readonly VideoReaction[];
  lastAdded: VideoReaction | undefined;
};

/** Shared playback interface for native controls and moment navigation. */
export type VideoPlayback = {
  duration: number;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  hasError: boolean;
  setHasError: (hasError: boolean) => void;
  burst: { key: number; emoji: string } | undefined;
  onLoaded: (video: HTMLVideoElement) => void;
  onTimeUpdate: (video: HTMLVideoElement) => void;
  onSeeking: () => void;
  onSeeked: () => void;
  seek: (seconds: number, shouldPlay?: boolean) => void;
};

/** Playback state and brief acknowledgements, excluding reactions crossed by seeks. */
export function useVideoPlayback(options: Readonly<Options>): VideoPlayback {
  const { media, transport, reactions, lastAdded } = options;
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [burst, setBurst] = useState<{ key: number; emoji: string }>();
  const previousTime = useRef(0);
  const isSeeking = useRef(false);
  const duration =
    media.durationMs === null ? loadedDuration : media.durationMs / 1000;
  const showReaction = (reaction: VideoReaction) => {
    setBurst((current) => {
      return { key: (current?.key ?? 0) + 1, emoji: reaction.emoji };
    });
  };
  useEffect(() => {
    if (lastAdded !== undefined) {
      showReaction(lastAdded);
    }
  }, [lastAdded]);
  useEffect(() => {
    if (burst === undefined) {
      return;
    }
    const timer = window.setTimeout(() => {
      setBurst(undefined);
    }, 1600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [burst]);
  return {
    duration,
    isPlaying,
    setIsPlaying,
    hasError,
    setHasError,
    burst,
    onLoaded: (video: HTMLVideoElement) => {
      setLoadedDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setHasError(false);
    },
    onTimeUpdate: (video: HTMLVideoElement) => {
      const crossed = getCrossedReactions({
        reactions,
        previousTime: previousTime.current,
        currentTime: video.currentTime,
        isSeeking: isSeeking.current || video.seeking || !isPlaying,
      });
      const reaction = crossed.at(-1);
      if (reaction !== undefined) {
        showReaction(reaction);
      }
      previousTime.current = video.currentTime;
      transport.setPosition(video.currentTime);
    },
    onSeeking: () => {
      isSeeking.current = true;
    },
    onSeeked: () => {
      previousTime.current = transport.videoRef.current?.currentTime ?? 0;
      isSeeking.current = false;
    },
    seek: (seconds: number, shouldPlay = false) => {
      const position = Math.min(duration, Math.max(0, seconds));
      isSeeking.current = transport.videoRef.current?.currentTime !== position;
      previousTime.current = position;
      if (shouldPlay) {
        transport.seekAndPlay(position);
      } else {
        if (transport.videoRef.current !== null) {
          transport.videoRef.current.currentTime = position;
        }
        transport.setPosition(position);
      }
    },
  };
}
