import type { MouseEvent } from "react";
import { getSourceRenewalFromVideo } from "./useVideoSourceRenewal";
import { playVideo } from "@/system/VideoFrame/playVideo";

/** Checks an expiring lease before a play gesture can start network playback. */
export function onVideoPlay(
  options: Readonly<{
    event: MouseEvent;
    video: HTMLVideoElement | null;
    onFailure: () => void;
  }>,
): void {
  const { video, event, onFailure } = options;
  if (video === null) {
    return;
  }
  const renewal = getSourceRenewalFromVideo(video);
  if (renewal === undefined) {
    return;
  }
  const isCurrent = renewal.selectPlayback(video.paused);
  if (!video.paused) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  void renewal
    .beforePlay()
    .then(() => {
      if (isCurrent()) {
        playVideo(video);
      }
    })
    .catch((error: unknown) => {
      if (
        isCurrent() &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        onFailure();
      }
    });
}
