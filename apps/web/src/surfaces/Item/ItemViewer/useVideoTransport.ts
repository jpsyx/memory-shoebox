import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { playVideo } from "@/system/VideoFrame/playVideo";

/** One selected moment whose native write still belongs to this item and node. */
export type VideoSeekIntent = {
  isCurrent: () => boolean;
  apply: (shouldPlay: boolean) => void;
  cancel: () => void;
};

/** Where the video stands, and the pin being placed on it. */
export type VideoTransport = {
  videoRef: RefObject<HTMLVideoElement | null>;
  position: number;
  setPosition: (seconds: number) => void;
  /** Accepts an annotation target before its native readiness check settles. */
  selectPosition: (seconds: number) => VideoSeekIntent;
  /** Ignores source-reset events until the current selected seek is acknowledged. */
  updatePositionFromVideo: (
    video: HTMLVideoElement,
    hasSeeked?: boolean,
  ) => boolean;
  /** Uses the selected target while pending, otherwise the precise native clock. */
  getAnnotationPosition: () => number;
  /** The moment a comment being written will stand at, if one is set. */
  pendingAt: number | undefined;
  setPendingAt: (seconds: number | undefined) => void;
  /** Explicitly starts playback at a moment; ordinary seeking preserves state. */
  seekAndPlay: (seconds: number) => void;
};

type SeekTarget = {
  video: HTMLVideoElement | null;
  position: number;
  applied: boolean;
};
type SeekOwner = {
  videoRef: RefObject<HTMLVideoElement | null>;
  target: RefObject<SeekTarget | undefined>;
  setPosition: (seconds: number) => void;
};
function _selectPosition(owner: SeekOwner, seconds: number): VideoSeekIntent {
  const target: SeekTarget = {
    video: owner.videoRef.current,
    position: seconds,
    applied: false,
  };
  owner.target.current = target;
  owner.setPosition(seconds);
  const isCurrent = () => {
    return (
      owner.target.current === target && owner.videoRef.current === target.video
    );
  };
  return {
    isCurrent,
    cancel: () => {
      if (isCurrent()) {
        owner.target.current = undefined;
        owner.setPosition(target.video?.currentTime ?? 0);
      }
    },
    apply: (shouldPlay) => {
      if (!isCurrent()) {
        return;
      }
      const video = target.video;
      target.applied = true;
      if (video !== null) {
        target.position = Math.min(
          seconds,
          Number.isFinite(video.duration) ? video.duration : seconds,
        );
        video.currentTime = target.position;
        if (shouldPlay) {
          playVideo(video);
        }
      }
      owner.setPosition(target.position);
    },
  };
}
function _updatePosition(
  owner: SeekOwner,
  video: HTMLVideoElement,
  hasSeeked: boolean,
): boolean {
  if (owner.videoRef.current !== video) {
    return false;
  }
  const target = owner.target.current;
  if (
    target !== undefined &&
    (!target.applied ||
      video.seeking ||
      (!hasSeeked && target.position !== video.currentTime))
  ) {
    return false;
  }
  owner.target.current = undefined;
  owner.setPosition(video.currentTime);
  return true;
}
function _retireChangedNode(owner: SeekOwner): void {
  if (
    owner.target.current !== undefined &&
    owner.target.current.video !== owner.videoRef.current
  ) {
    owner.target.current = undefined;
    owner.setPosition(owner.videoRef.current?.currentTime ?? 0);
  }
}
function useSeekOwner(itemId: string): SeekOwner & { position: number } {
  const videoRef = useRef<HTMLVideoElement>(null);
  const target = useRef<SeekTarget | undefined>(undefined);
  const [position, setPosition] = useState(0);
  const [ownerItemId, setOwnerItemId] = useState(itemId);
  if (ownerItemId !== itemId) {
    setOwnerItemId(itemId);
    target.current = undefined;
    setPosition(0);
  }
  const owner = useRef<SeekOwner>({ videoRef, target, setPosition }).current;
  // Each render checks its committed node, including a stable ref changing nodes.
  useLayoutEffect(() => {
    _retireChangedNode(owner);
  });
  useLayoutEffect(() => {
    return () => {
      target.current = undefined;
    };
  }, []);
  return { ...owner, position };
}

/** Shared item-owned position; a new item starts with no selected moment. */
export function useVideoTransport(itemId: string): VideoTransport {
  const owner = useSeekOwner(itemId);
  const [pendingAt, setPendingAt] = useState<number | undefined>(undefined);
  const [transportItemId, setTransportItemId] = useState(itemId);
  if (transportItemId !== itemId) {
    setTransportItemId(itemId);
    setPendingAt(undefined);
  }
  const setPosition = (seconds: number) => {
    owner.target.current = undefined;
    owner.setPosition(seconds);
  };
  return {
    videoRef: owner.videoRef,
    position: owner.position,
    setPosition,
    selectPosition: (seconds) => {
      return _selectPosition(owner, seconds);
    },
    updatePositionFromVideo: (video, hasSeeked = false) => {
      return _updatePosition(owner, video, hasSeeked);
    },
    getAnnotationPosition: () => {
      const target = owner.target.current;
      return target !== undefined && target.video === owner.videoRef.current
        ? target.position
        : (owner.videoRef.current?.currentTime ?? owner.position);
    },
    pendingAt,
    setPendingAt,
    seekAndPlay: (seconds) => {
      const video = owner.videoRef.current;
      if (video !== null) {
        video.currentTime = seconds;
        playVideo(video);
      }
      setPosition(seconds);
    },
  };
}
