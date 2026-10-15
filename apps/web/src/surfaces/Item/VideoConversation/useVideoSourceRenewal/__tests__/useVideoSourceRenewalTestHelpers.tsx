import { afterEach, vi } from "vitest";

import { makeVideoDetail } from "@/testing/itemFixtureHelpers";

/** Baseline video media containing the original fixture source identities. */
export const media = makeVideoDetail().media;
/** Returns an unattached video double with preserved playback properties and observable load/play/pause methods for renewal assertions. */
export function createTestVideo(paused = false): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperties(video, {
    paused: { configurable: true, value: paused },
    duration: { configurable: true, value: 30 },
    currentSrc: {
      configurable: true,
      get: () => {
        return video.src;
      },
    },
  });
  video.currentTime = 12.4;
  video.playbackRate = 1.5;
  video.volume = 0.3;
  video.muted = true;
  video.load = vi.fn();
  video.play = vi.fn().mockResolvedValue(undefined);
  video.pause = vi.fn();
  return video;
}
/** Restores spies after each video source-renewal scenario. */
export function installUseVideoSourceRenewalTestLifecycle(): void {
  afterEach(() => {
    return vi.restoreAllMocks();
  });
}
