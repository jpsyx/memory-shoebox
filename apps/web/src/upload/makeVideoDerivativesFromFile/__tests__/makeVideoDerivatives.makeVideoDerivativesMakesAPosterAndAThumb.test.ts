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

  it("makes a poster and a thumb from a frame the engine presented", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
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
    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
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

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: false });
    await vi.advanceTimersByTimeAsync(FRAME_WAIT_MS);

    await expect(made).resolves.toEqual({ derivatives: [], size: SIZE });
    expect(makeJpegFromSource).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });

  it("makes no poster from a video that holds no frame yet", async () => {
    media.readyState = 1;

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await _settle();
    await _deliverSeekedFrame({ hasFrameCallback: true });

    await expect(made).resolves.toEqual({ derivatives: [], size: SIZE });
    expect(makeJpegFromSource).not.toHaveBeenCalled();
  });

  it("waits for a hidden tab to be shown on WebKit, and starts its budget then", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);
    media.hidden = true;

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(HIDDEN_TAB_WAIT_MS - 1000);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("video")).toBeNull();

    _setTabHidden(false);
    await _settle();
    expect(document.querySelector("video")).not.toBeNull();
    // Longer than the cap, and nearly the overall budget, since it was shown.
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS - 5000);
    await _deliverSeekedFrame({ hasFrameCallback: true });

    const result = await made;
    expect(result.derivatives).toHaveLength(2);
  });

  it("gives up on a tab that stays hidden past the cap on WebKit, with no poster", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);
    media.hidden = true;

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(HIDDEN_TAB_WAIT_MS);

    await expect(made).resolves.toEqual({ derivatives: [], size: undefined });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("video")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    // The listener went with it: showing the tab later starts nothing.
    _setTabHidden(false);
    await _settle();
    expect(document.querySelector("video")).toBeNull();
  });

  it("measures the cap from when the tab was hidden, so the batch pays it once", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);
    _setTabHidden(true);

    const first = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(5000);
    const second = makeVideoDerivativesFromFile(new Blob(["v"]));
    const settled: string[] = [];
    void first.then(() => {
      settled.push("first");
    });
    void second.then(() => {
      settled.push("second");
    });

    // The second started five seconds late, so it waits five seconds less.
    await vi.advanceTimersByTimeAsync(HIDDEN_TAB_WAIT_MS - 5000 - 1);
    expect(settled).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual(["first", "second"]);

    // Past the cap, the next video answers at once instead of waiting again.
    const third = makeVideoDerivativesFromFile(new Blob(["v"]));
    void third.then(() => {
      settled.push("third");
    });
    await _settle();
    expect(settled).toEqual(["first", "second", "third"]);
    await expect(third).resolves.toEqual({ derivatives: [], size: undefined });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("gives a tab that is hidden again a fresh cap", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);
    _setTabHidden(true);
    const first = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(HIDDEN_TAB_WAIT_MS);
    await first;

    _setTabHidden(false);
    _setTabHidden(true);
    const nextVideoDerivatives = makeVideoDerivativesFromFile(new Blob(["v"]));
    await vi.advanceTimersByTimeAsync(HIDDEN_TAB_WAIT_MS - 1000);
    _setTabHidden(false);
    await _settle();

    expect(document.querySelector("video")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    await nextVideoDerivatives;
  });

  it("keeps waiting through a visibility change that leaves the tab hidden", async () => {
    vi.mocked(isWebKitImageEncoder).mockResolvedValue(true);
    media.hidden = true;

    const made = makeVideoDerivativesFromFile(new Blob(["v"]));
    document.dispatchEvent(new Event("visibilitychange"));
    await _settle();
    expect(document.querySelector("video")).toBeNull();

    _setTabHidden(false);
    await _settle();
    expect(document.querySelector("video")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(OVERALL_TIMEOUT_MS);
    await expect(made).resolves.toEqual({ derivatives: [], size: undefined });
  });
});
