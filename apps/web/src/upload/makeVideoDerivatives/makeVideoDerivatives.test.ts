import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWebKitImageEncoder,
  makeJpegFromSource,
} from "@/upload/jpegDerivatives/jpegDerivatives";
import {
  getPosterSeekSecondsFromDuration,
  getVideoDerivativeSizesFromSize,
  isPosterFrameDrawable,
  makeVideoDerivatives,
  waitForPresentedFrame,
} from "@/upload/makeVideoDerivatives/makeVideoDerivatives";

vi.mock("@/upload/jpegDerivatives/jpegDerivatives", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/upload/jpegDerivatives/jpegDerivatives")
    >();
  return {
    ...original,
    isWebKitImageEncoder: vi.fn(),
    makeJpegFromSource: vi.fn(),
  };
});

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

describe("makeVideoDerivatives", () => {
  const OBJECT_URL = "blob:video";
  const FRAME_WAIT_MS = 500;
  const OVERALL_TIMEOUT_MS = 20_000;
  const SIZE = { width: 1920, height: 1080 };
  const media = { readyState: 4, hidden: false };

  /** A JPEG the stubbed encoder hands back. */
  function _makeJpegBlob(): Blob {
    return new Blob(["x"], { type: "image/jpeg" });
  }

  /** The one video the code under test has put in the document. */
  function _getVideo(): HTMLVideoElement {
    const video = document.querySelector("video");
    if (video === null) {
      throw new Error("There is no video in the document.");
    }
    return video;
  }

  /** Lets every promise that can settle settle, without moving the clock. */
  async function _settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
  }

  /** Tells the code under test the metadata is in, then that the seek is done. */
  async function _deliverSeekedFrame(options: {
    hasFrameCallback: boolean;
  }): Promise<void> {
    const video = _getVideo();
    if (options.hasFrameCallback) {
      Object.assign(video, {
        requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => {
          callback(0, FRAME_METADATA);
          return 1;
        },
      });
    }
    video.dispatchEvent(new Event("loadedmetadata"));
    await _settle();
    video.dispatchEvent(new Event("seeked"));
    await _settle();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    media.readyState = 4;
    media.hidden = false;
    Object.assign(URL, {
      createObjectURL: vi.fn(() => {
        return OBJECT_URL;
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(
      HTMLMediaElement.prototype,
      "readyState",
      "get",
    ).mockImplementation(() => {
      return media.readyState;
    });
    vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(10);
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
      SIZE.width,
    );
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
      SIZE.height,
    );
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(document, "hidden", "get").mockImplementation(() => {
      return media.hidden;
    });
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(false);
    vi.mocked(makeJpegFromSource).mockImplementation(() => {
      return Promise.resolve(_makeJpegBlob());
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(isWebKitImageEncoder).mockReset();
    vi.mocked(makeJpegFromSource).mockReset();
    document.body.replaceChildren();
  });

  it("makes a poster and a thumb from a frame the engine presented", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);

    const made = makeVideoDerivatives(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: true });

    const result = await made;
    expect(
      result.derivatives.map(({ purpose, width, height }) => {
        return { purpose, width, height };
      }),
    ).toEqual([
      { purpose: "poster", width: 1920, height: 1080 },
      { purpose: "thumb", width: 480, height: 270 },
    ]);
    expect(result.size).toEqual(SIZE);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
    expect(document.querySelector("video")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still draws after the timeout in Chrome, which never calls back on a paused seek", async () => {
    const made = makeVideoDerivatives(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);

    const result = await made;
    expect(
      result.derivatives.map(({ purpose }) => {
        return purpose;
      }),
    ).toEqual(["poster", "thumb"]);
    expect(result.size).toEqual(SIZE);
  });

  it("makes no poster after the timeout in WebKit, rather than a black one", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);

    const made = makeVideoDerivatives(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);

    await expect(made).resolves.toEqual({ derivatives: [], size: SIZE });
    expect(makeJpegFromSource).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });

  it("makes no poster from a video that holds no frame yet", async () => {
    media.readyState = 1;

    const made = makeVideoDerivatives(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: true });

    await expect(made).resolves.toEqual({ derivatives: [], size: SIZE });
    expect(makeJpegFromSource).not.toHaveBeenCalled();
  });

  it("waits for a hidden tab to be shown before it starts, and starts its budget then", async () => {
    media.hidden = true;

    const made = makeVideoDerivatives(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS + 10_000);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("video")).toBeNull();

    media.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await _settle();
    expect(document.querySelector("video")).not.toBeNull();
    await _deliverSeekedFrame({ hasFrameCallback: true });

    const result = await made;
    expect(result.derivatives).toHaveLength(2);
  });

  it("keeps waiting through a visibility change that leaves the tab hidden", async () => {
    media.hidden = true;

    makeVideoDerivatives(new Blob(["v"])).catch(() => {});
    document.dispatchEvent(new Event("visibilitychange"));
    await _settle();

    expect(document.querySelector("video")).toBeNull();
  });

  it("answers with no poster, and a fresh result, when the video never decodes", async () => {
    const first = makeVideoDerivatives(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    const firstResult = await first;
    const second = makeVideoDerivatives(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    const secondResult = await second;

    expect(firstResult).toEqual({ derivatives: [], size: null });
    expect(firstResult).not.toBe(secondResult);
    expect(firstResult.derivatives).not.toBe(secondResult.derivatives);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
    expect(document.querySelector("video")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops encoding once the overall timeout has answered", async () => {
    let finishPoster: (blob: Blob) => void = () => {};
    vi.mocked(makeJpegFromSource).mockImplementationOnce(() => {
      return new Promise((settle) => {
        finishPoster = settle;
      });
    });

    const made = makeVideoDerivatives(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    await expect(made).resolves.toEqual({ derivatives: [], size: null });

    finishPoster(_makeJpegBlob());
    await _settle();

    expect(makeJpegFromSource).toHaveBeenCalledTimes(1);
  });

  it("revokes the object URL even when setting the video up throws", async () => {
    vi.spyOn(document.body, "append").mockImplementationOnce(() => {
      throw new Error("The document would not take the video.");
    });

    await expect(makeVideoDerivatives(new Blob(["v"]))).resolves.toEqual({
      derivatives: [],
      size: null,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });
});
