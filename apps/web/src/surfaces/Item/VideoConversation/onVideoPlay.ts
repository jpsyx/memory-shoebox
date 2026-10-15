import type { KeyboardEvent, MouseEvent } from "react";
import { getSourceRenewalFromVideo } from "./useVideoSourceRenewal";
import { playVideo } from "@/system/VideoFrame/playVideo";

type PlaybackOptions = {
  video: HTMLVideoElement | null;
  onFailure: () => void;
};

/** Routes Video.js's focused-button keyboard activation through the lease owner. */
export function onVideoPlayKey(
  options: Readonly<PlaybackOptions & { event: KeyboardEvent }>,
): void {
  const { event } = options;
  if (
    event.target !== event.currentTarget ||
    !(
      (event.type === "keydown" && event.key === "Enter") ||
      (event.type === "keyup" && event.key === " ")
    )
  ) {
    return;
  }
  // Video.js activates directly on these events; prevent an extra native click.
  event.preventDefault();
  onVideoPlay(options);
}

/** Checks an expiring lease before a play gesture can start network playback. */
export function onVideoPlay(
  options: Readonly<PlaybackOptions & { event: MouseEvent | KeyboardEvent }>,
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
      if (isCurrent() && video.paused) {
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
