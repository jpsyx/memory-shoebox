import { afterEach, vi } from "vitest";

import { makeVideoDetail } from "@/testing/itemFixtureHelpers";

/** Shared scenario fixture. */
export const media = makeVideoDetail().media;
/** Shared scenario fixture. */
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
/** Registers the owned scenario setup and cleanup. */
export function installUseVideoSourceRenewalTestLifecycle(): void {
  afterEach(() => {
    return vi.restoreAllMocks();
  });
}
