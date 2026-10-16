import { useEffect, type RefObject } from "react";
import type { ViewerReadiness } from "../PhotoReadinessContext";
import {
  getPhotoViewportFromElement,
  type PhotoViewport,
} from "../photoViewportHelpers";
import { usePhotoViewport } from "../usePhotoViewport";
type VideoReadinessOptions = {
  itemId: string;
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onReady: ((state: ViewerReadiness | undefined) => void) | undefined;
};

const READINESS_EVENTS = [
  "loadedmetadata",
  "loadeddata",
  "progress",
  "canplay",
  "pause",
  "play",
  "timeupdate",
  "waiting",
  "emptied",
] as const;

function _getReadinessFromVideo({
  video,
  itemId,
  viewport,
}: {
  video: HTMLVideoElement;
  itemId: string;
  viewport: PhotoViewport | undefined;
}): ViewerReadiness | undefined {
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
    viewport:
      viewport ?? getPhotoViewportFromElement(video.parentElement ?? undefined),
    photosReady: video.readyState >= 2 && (video.paused || hasBufferedFrame),
  };
}

/** Posters follow metadata; photo transfers wait for a useful first frame. */
export function useVideoReadiness(
  options: Readonly<VideoReadinessOptions>,
): void {
  const { itemId, enabled, videoRef, onReady } = options;
  const viewport = usePhotoViewport({
    reference: videoRef,
    initial: undefined,
    measureParent: true,
  });
  useEffect(
    function observeVideoReadiness() {
      const video = videoRef.current;
      if (!enabled || video === null || onReady === undefined) {
        return;
      }
      let previous = "";
      const report = () => {
        const state = _getReadinessFromVideo({ video, itemId, viewport });
        const identity = JSON.stringify(state);
        if (previous !== identity) {
          previous = identity;
          onReady(state);
        }
      };
      READINESS_EVENTS.forEach((event) => {
        video.addEventListener(event, report);
      });
      report();
      return () => {
        READINESS_EVENTS.forEach((event) => {
          video.removeEventListener(event, report);
        });
        onReady(undefined);
      };
    },
    [itemId, enabled, videoRef, onReady, viewport],
  );
}
