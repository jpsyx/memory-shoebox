import { FRAME_METADATA } from "./makeVideoDerivativesTestFixtures.constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWebKitImageEncoder,
  makeJpegFromSource,
} from "@/upload/jpegDerivativesHelpers/jpegDerivativesHelpers";

import { HIDDEN_TAB_WAIT_MS } from "@/upload/makeVideoDerivativesFromFile/waitUntilReadyToCapture";
import { makeVideoDerivativesFromFile } from "@/upload/makeVideoDerivativesFromFile/makeVideoDerivativesFromFile";

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

describe("makeVideoDerivatives", () => {
  const OBJECT_URL = "blob:video";

  const FRAME_WAIT_MS = 500;

  const OVERALL_TIMEOUT_MS = 20_000;

  const SIZE = { width: 1920, height: 1080 };

  const media = { readyState: 4, hidden: false };

  // A JPEG the stubbed encoder hands back.
  const _makeJpegBlob = (): Blob => {
    return new Blob(["x"], { type: "image/jpeg" });
  };

  // The one video the code under test has put in the document.
  const _getVideo = (): HTMLVideoElement => {
    const video = document.querySelector("video");
    if (video === null) {
      throw new Error("There is no video in the document.");
    }
    return video;
  };

  // Lets every promise that can settle settle, without moving the clock.
  const _settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

  // Tells the code under test the metadata is in, then that the seek is done.
  const _deliverSeekedFrame = async (options: {
    hasFrameCallback: boolean;
  }): Promise<void> => {
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
  };

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
    // The module remembers since when the tab has been hidden: show it again.
    media.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(isWebKitImageEncoder).mockReset();
    vi.mocked(makeJpegFromSource).mockReset();
    document.body.replaceChildren();
  });

  // Shows or hides the tab, as the browser does: the state, then the event.
  const _setTabHidden = (isHidden: boolean): void => {
    media.hidden = isHidden;
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("does not wait for a hidden tab in Chrome, and draws its poster", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(false);
    _setTabHidden(true);

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await _settle();
    expect(document.querySelector("video")).not.toBeNull();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);

    const result = await made;
    expect(result.derivatives).toHaveLength(2);
    expect(result.size).toEqual(SIZE);
  });

  it("does not wait either once a tab has been hidden past the cap, in Chrome", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(false);
    _setTabHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_TAB_WAIT_MS + 1000);

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);

    await expect(made).resolves.toMatchObject({ size: SIZE });
    expect(makeJpegFromSource).toHaveBeenCalledTimes(2);
  });

  it("answers with no poster, and a fresh result, when the video never decodes", async () => {
    const first = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    const firstResult = await first;
    const second = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    const secondResult = await second;

    expect(firstResult).toEqual({ derivatives: [], size: undefined });
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

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    await expect(made).resolves.toEqual({ derivatives: [], size: undefined });

    finishPoster(_makeJpegBlob());
    await _settle();

    expect(makeJpegFromSource).toHaveBeenCalledTimes(1);
  });

  it("revokes the object URL even when setting the video up throws", async () => {
    vi.spyOn(document.body, "append").mockImplementationOnce(() => {
      throw new Error("The document would not take the video.");
    });

    await expect(
      makeVideoDerivativesFromFile(new Blob(["v"])),
    ).resolves.toEqual({
      derivatives: [],
      size: undefined,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });
});
