import { useEffect, type RefObject } from "react";
import { getPhotoViewportFromElement } from "./photoViewport";
import type { ViewerReadiness } from "./PhotoReadinessContext";

const readinessEvents = [
  "loadedmetadata",
  "loadeddata",
  "progress",
  "canplay",
  "pause",
  "play",
  "timeupdate",
  "waiting",
  "emptied",
];

function _getReadinessFromVideo(
  video: HTMLVideoElement,
  itemId: string,
): ViewerReadiness | undefined {
  if (video.readyState < 1) {
    return undefined;
  }
  const hasBufferedFrame = Array.from(
    { length: video.buffered.length },
    (_unused, index) => {
      return (
        video.buffered.start(index) <= video.currentTime &&
        video.buffered.end(index) >= video.currentTime + 2
      );
    },
  ).some(Boolean);
  return {
    itemId,
    sourceKey: `${itemId}:${video.currentSrc}`,
    viewport: getPhotoViewportFromElement(video.parentElement),
    photosReady: video.readyState >= 2 && (video.paused || hasBufferedFrame),
  };
}

/** Posters follow metadata; photo transfers wait for a useful first frame. */
export function useVideoReadiness(
  options: Readonly<{
    itemId: string;
    enabled: boolean;
    videoRef: RefObject<HTMLVideoElement | null>;
    onReady: ((state: ViewerReadiness | undefined) => void) | undefined;
  }>,
): void {
  const { itemId, enabled, videoRef, onReady } = options;
  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || video === null || onReady === undefined) {
      return;
    }
    let previous = "";
    const report = () => {
      const state = _getReadinessFromVideo(video, itemId);
      const identity = JSON.stringify(state);
      if (previous !== identity) {
        previous = identity;
        onReady(state);
      }
    };
    readinessEvents.forEach((event) => {
      video.addEventListener(event, report);
    });
    report();
    return () => {
      readinessEvents.forEach((event) => {
        video.removeEventListener(event, report);
      });
      onReady(undefined);
    };
  }, [itemId, enabled, videoRef, onReady]);
}
