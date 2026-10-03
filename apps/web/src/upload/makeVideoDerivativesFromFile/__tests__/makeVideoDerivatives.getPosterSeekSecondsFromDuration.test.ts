import { FRAME_METADATA } from "./makeVideoDerivativesTestFixtures.constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPosterSeekSecondsFromDuration,
  getVideoDerivativeSizesFromSize,
  isPosterFrameDrawable,
  waitForPresentedFrame,
} from "@/upload/makeVideoDerivativesFromFile/videoPosterFrameHelpers";

vi.mock(
  "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers")
      >();
    return {
      ...original,
      isWebKitImageEncoder: vi.fn(),
      makeJpegFromSource: vi.fn(),
    };
  },
);

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

    await expect(
      waitForPresentedFrame({ video: video, timeoutMs: 500 }),
    ).resolves.toBe("frame");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("goes on after the timeout when no frame comes, as in Chrome, and cancels the wait", async () => {
    const cancelVideoFrameCallback = vi.fn();
    const video = {
      requestVideoFrameCallback: () => {
        return 42;
      },
      cancelVideoFrameCallback,
    };

    const waited = waitForPresentedFrame({ video: video, timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    await expect(waited).resolves.toBe("timeout");
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(42);
  });

  it("goes on after the timeout in a browser with no callback at all", async () => {
    const waited = waitForPresentedFrame({ video: {}, timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    await expect(waited).resolves.toBe("timeout");
  });
});

describe("isPosterFrameDrawable", () => {
  const HAVE_NOTHING = 0;
  const HAVE_METADATA = 1;
  const HAVE_CURRENT_DATA = 2;

  it("draws a presented frame in either engine", () => {
    expect(
      isPosterFrameDrawable({
        waitedFor: "frame",
        isWebKitEncoder: true,
        readyState: HAVE_CURRENT_DATA,
      }),
    ).toBe(true);
    expect(
      isPosterFrameDrawable({
        waitedFor: "frame",
        isWebKitEncoder: false,
        readyState: HAVE_CURRENT_DATA,
      }),
    ).toBe(true);
  });

  it("draws after the timeout in Chrome, whose seeked frame is right", () => {
    expect(
      isPosterFrameDrawable({
        waitedFor: "timeout",
        isWebKitEncoder: false,
        readyState: HAVE_CURRENT_DATA,
      }),
    ).toBe(true);
  });

  it("does not draw after the timeout in WebKit, where it would be black", () => {
    expect(
      isPosterFrameDrawable({
        waitedFor: "timeout",
        isWebKitEncoder: true,
        readyState: HAVE_CURRENT_DATA,
      }),
    ).toBe(false);
  });

  it("does not draw before the video holds a frame, whichever event ended the wait", () => {
    [HAVE_NOTHING, HAVE_METADATA].forEach((readyState) => {
      (["frame", "timeout"] as const).forEach((waitedFor) => {
        expect(
          isPosterFrameDrawable({
            waitedFor,
            isWebKitEncoder: false,
            readyState,
          }),
        ).toBe(false);
      });
    });
  });
});
