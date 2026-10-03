import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPosterSeekSecondsFromDuration,
  getVideoDerivativeSizesFromSize,
  waitForPresentedFrame,
} from "@/upload/makeVideoDerivatives/makeVideoDerivatives";

/** The metadata a presented frame comes with; the recipe ignores it. */
const FRAME_METADATA: VideoFrameCallbackMetadata = {
  expectedDisplayTime: 0,
  height: 1,
  mediaTime: 0,
  presentationTime: 0,
  presentedFrames: 1,
  width: 1,
};

describe("getPosterSeekSecondsFromDuration", () => {
  it("takes a tenth of a short clip, so it never shows the last frame", () => {
    expect(getPosterSeekSecondsFromDuration(2)).toBeCloseTo(0.2);
  });

  it("never seeks past one second, however long the video", () => {
    expect(getPosterSeekSecondsFromDuration(10)).toBe(1);
    expect(getPosterSeekSecondsFromDuration(525)).toBe(1);
  });

  it("takes the first frame when the duration cannot be stated", () => {
    expect(getPosterSeekSecondsFromDuration(Number.NaN)).toBe(0);
    expect(getPosterSeekSecondsFromDuration(Number.POSITIVE_INFINITY)).toBe(0);
    expect(getPosterSeekSecondsFromDuration(0)).toBe(0);
  });
});

describe("getVideoDerivativeSizesFromSize", () => {
  it("makes a 2048 poster and a 480 thumb from a 4K portrait video", () => {
    expect(
      getVideoDerivativeSizesFromSize({ width: 2160, height: 3840 }),
    ).toEqual({
      poster: { width: 1152, height: 2048 },
      thumb: { width: 270, height: 480 },
    });
  });

  it("never upscales a small video's poster", () => {
    expect(
      getVideoDerivativeSizesFromSize({ width: 640, height: 360 }).poster,
    ).toEqual({ width: 640, height: 360 });
  });
});

describe("waitForPresentedFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes on as soon as a frame is presented, as WebKit does", async () => {
    const video = {
      requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => {
        callback(0, FRAME_METADATA);
        return 1;
      },
    };

    await expect(waitForPresentedFrame(video, 500)).resolves.toBe("frame");
  });

  it("goes on after the timeout when no frame comes, as in Chrome, and cancels the wait", async () => {
    const cancelVideoFrameCallback = vi.fn();
    const video = {
      requestVideoFrameCallback: () => {
        return 42;
      },
      cancelVideoFrameCallback,
    };

    const waited = waitForPresentedFrame(video, 500);
    await vi.advanceTimersByTimeAsync(500);

    await expect(waited).resolves.toBe("timeout");
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(42);
  });

  it("goes on after the timeout in a browser with no callback at all", async () => {
    const waited = waitForPresentedFrame({}, 500);
    await vi.advanceTimersByTimeAsync(500);

    await expect(waited).resolves.toBe("timeout");
  });
});
