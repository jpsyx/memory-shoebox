import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeVideoDetail } from "@/testing/itemFixtureHelpers";
import { useVideoSourceRenewal } from "./useVideoSourceRenewal";

const media = makeVideoDetail().media;
function _video(paused = false) {
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
afterEach(() => {
  return vi.restoreAllMocks();
});
describe("video source renewal", () => {
  it.each([true, false])(
    "restores playback after lease replacement (paused=%s)",
    async (paused) => {
      const video = _video(paused);
      const renew = vi.fn().mockResolvedValue(media);
      const view = renderHook(
        ({ source }) => {
          return useVideoSourceRenewal({
            itemId: "item",
            videoRef: { current: video },
            source,
            renew,
          });
        },
        { initialProps: { source: media.playback } },
      );
      view.rerender({
        source: { ...media.playback!, url: "https://example.invalid/new.mp4" },
      });
      expect(video.load).toHaveBeenCalledOnce();
      video.currentTime = 0;
      video.playbackRate = 1;
      video.volume = 1;
      video.muted = false;
      await act(async () => {
        return video.dispatchEvent(new Event("loadedmetadata"));
      });
      expect(video.currentTime).toBeCloseTo(12.4, 1);
      expect(video.playbackRate).toBe(1.5);
      expect(video.volume).toBe(0.3);
      expect(video.muted).toBe(true);
      expect(video.play).toHaveBeenCalledTimes(paused ? 0 : 1);
    },
  );
  it("does not treat a source-load pause event as a later explicit pause", async () => {
    const video = _video(false);
    video.load = vi.fn(() => {
      Object.defineProperty(video, "paused", {
        configurable: true,
        value: true,
      });
      video.dispatchEvent(new Event("pause"));
    });
    const view = renderHook(
      ({ source }) => {
        return useVideoSourceRenewal({
          itemId: "item",
          videoRef: { current: video },
          source,
          renew: async () => {
            return media;
          },
        });
      },
      { initialProps: { source: media.playback } },
    );
    view.rerender({
      source: {
        ...media.playback!,
        url: "https://example.invalid/load-pause.mp4",
      },
    });
    expect(video.paused).toBe(true);
    expect(video.play).not.toHaveBeenCalled();
    await act(async () => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(12.4);
  });

  it("does not reload on unrelated metadata and clamps a shortened duration", async () => {
    const video = _video(true);
    const renew = vi.fn().mockResolvedValue(media);
    const view = renderHook(
      ({ source }) => {
        return useVideoSourceRenewal({
          itemId: "item",
          videoRef: { current: video },
          source,
          renew,
        });
      },
      { initialProps: { source: media.playback } },
    );
    view.rerender({ source: { ...media.playback! } });
    expect(video.load).not.toHaveBeenCalled();
    view.rerender({
      source: { ...media.playback!, url: "https://example.invalid/new.mp4" },
    });
    Object.defineProperty(video, "duration", { value: 8 });
    await act(async () => {
      return video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(video.currentTime).toBeLessThanOrEqual(8);
  });
  it("checks expired seeking and allows only one automatic failure across renewed URLs", async () => {
    const video = _video(true);
    const expiredSource = {
      ...media.playback!,
      expiresAt: new Date(0).toISOString(),
    };
    const renew = vi.fn().mockResolvedValue(media);
    const view = renderHook(
      ({ source }) => {
        return useVideoSourceRenewal({
          itemId: "item",
          videoRef: { current: video },
          source,
          renew,
        });
      },
      { initialProps: { source: expiredSource } },
    );
    await act(async () => {
      return view.result.current.beforeSeek();
    });
    expect(renew).toHaveBeenCalledOnce();
    await act(async () => {
      const pending = view.result.current.onSourceError();
      await Promise.resolve();
      video.dispatchEvent(new Event("loadedmetadata"));
      await pending;
    });
    expect(renew).toHaveBeenCalledTimes(2);
    view.rerender({
      source: { ...expiredSource, url: "https://example.invalid/new.mp4" },
    });
    await expect(view.result.current.onSourceError()).rejects.toThrow();
    expect(renew).toHaveBeenCalledTimes(2);
  });
  it("does not classify rejected play as a source transport failure", async () => {
    const video = _video();
    video.play = vi
      .fn()
      .mockRejectedValue(
        new DOMException("gesture required", "NotAllowedError"),
      );
    const renew = vi.fn().mockResolvedValue(media);
    const view = renderHook(
      ({ source }) => {
        return useVideoSourceRenewal({
          itemId: "item",
          videoRef: { current: video },
          source,
          renew,
        });
      },
      { initialProps: { source: media.playback } },
    );
    view.rerender({
      source: { ...media.playback!, url: "https://example.invalid/new.mp4" },
    });
    await act(async () => {
      return video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(renew).not.toHaveBeenCalled();
  });
});

it("reports a transport failure during the automatic replacement without another renewal", async () => {
  const video = _video();
  const renew = vi.fn().mockResolvedValue(media);
  const view = renderHook(() => {
    return useVideoSourceRenewal({
      itemId: "item",
      videoRef: { current: video },
      source: media.playback,
      renew,
    });
  });
  const pending = view.result.current.onSourceError();
  const failed = expect(pending).rejects.toThrow("transport");
  await act(async () => {
    await Promise.resolve();
    video.dispatchEvent(new Event("error"));
  });
  await failed;
  await expect(view.result.current.onSourceError()).rejects.toThrow(
    "explicit retry",
  );
  expect(renew).toHaveBeenCalledOnce();
});
it("does not restore an old item after renewal or readiness outlives its node", async () => {
  const oldVideo = _video();
  const replacement = _video(true);
  replacement.currentTime = 2;
  let finish!: (renewedMedia: typeof media) => void;
  const renew = vi.fn(() => {
    return new Promise<typeof media>((resolve) => {
      finish = resolve;
    });
  });
  const view = renderHook(
    ({ itemId, video }) => {
      return useVideoSourceRenewal({
        itemId,
        videoRef: { current: video },
        source: media.playback,
        renew,
      });
    },
    { initialProps: { itemId: "old", video: oldVideo } },
  );
  const pending = view.result.current.onSourceError();
  view.rerender({ itemId: "new", video: replacement });
  await act(async () => {
    finish({
      ...media,
      playback: { ...media.playback!, url: "https://example.invalid/late.mp4" },
    });
    await pending;
    oldVideo.dispatchEvent(new Event("loadedmetadata"));
  });
  expect(replacement.currentTime).toBe(2);
  expect(replacement.load).not.toHaveBeenCalled();
  expect(replacement.play).not.toHaveBeenCalled();
});
it("clears a denied native source and ignores its late readiness", async () => {
  const video = _video();
  const reference = { current: video as HTMLVideoElement | null };
  const renew = vi.fn().mockResolvedValue(media);
  const view = renderHook(
    ({ source }) => {
      return useVideoSourceRenewal({
        itemId: "item",
        videoRef: reference,
        source,
        renew,
      });
    },
    { initialProps: { source: media.playback } },
  );
  view.rerender({
    source: { ...media.playback!, url: "https://example.invalid/renewed.mp4" },
  });
  reference.current = null;
  view.rerender({ source: null });
  video.dispatchEvent(new Event("loadedmetadata"));
  expect(video.hasAttribute("src")).toBe(false);
  expect(video.play).not.toHaveBeenCalled();
});

it("does not let an older renewal replace a newly selected rendition on the same node", async () => {
  const video = _video(true);
  let finish!: (renewedMedia: typeof media) => void;
  const renew = vi.fn(() => {
    return new Promise<typeof media>((resolve) => {
      finish = resolve;
    });
  });
  const view = renderHook(
    ({ source }) => {
      return useVideoSourceRenewal({
        itemId: "item",
        videoRef: { current: video },
        source,
        renew,
      });
    },
    { initialProps: { source: media.playback } },
  );
  const pending = view.result.current.onSourceError();
  const replacement = {
    ...media.playback!,
    renditionId: "new-rendition",
    url: "https://example.invalid/new-rendition.mp4",
  };
  view.rerender({ source: replacement });
  await act(async () => {
    finish(media);
    await Promise.resolve();
  });
  expect(video.src).toBe(replacement.url);
  await act(async () => {
    video.dispatchEvent(new Event("loadedmetadata"));
    await pending;
  });
});

it("waits for the replacement's matching native metadata", async () => {
  const video = _video();
  const view = renderHook(
    ({ source }) => {
      return useVideoSourceRenewal({
        itemId: "item",
        videoRef: { current: video },
        source,
        renew: async () => {
          return media;
        },
      });
    },
    { initialProps: { source: media.playback } },
  );
  const replacement = {
    ...media.playback!,
    url: "https://example.invalid/new.mp4",
  };
  view.rerender({ source: replacement });
  Object.defineProperty(video, "currentSrc", {
    configurable: true,
    value: media.playback!.url,
  });
  video.currentTime = 0;
  video.dispatchEvent(new Event("loadedmetadata"));
  expect(video.currentTime).toBe(0);
  expect(video.play).not.toHaveBeenCalled();
  Object.defineProperty(video, "currentSrc", {
    configurable: true,
    value: replacement.url,
  });
  video.dispatchEvent(new Event("loadedmetadata"));
  expect(video.currentTime).toBeCloseTo(12.4, 1);
  expect(video.play).toHaveBeenCalledOnce();
});

it.each(["play", "seeking"])(
  "moves native %s ownership across a stable ref's old/null/new nodes",
  async (eventName) => {
    const retired = _video(true);
    const replacement = _video(true);
    const reference = { current: retired as HTMLVideoElement | null };
    const removed = vi.spyOn(retired, "removeEventListener");
    const renew = vi.fn().mockResolvedValue(media);
    const expiredSource = {
      ...media.playback!,
      expiresAt: new Date(0).toISOString(),
    };
    const view = renderHook(
      ({ source }) => {
        return useVideoSourceRenewal({
          itemId: "item",
          videoRef: reference,
          source,
          renew,
        });
      },
      { initialProps: { source: expiredSource as typeof media.playback } },
    );
    reference.current = null;
    view.rerender({ source: null });
    expect(
      removed.mock.calls.map(([name]) => {
        return name;
      }),
    ).toEqual(expect.arrayContaining(["play", "seeking"]));
    reference.current = replacement;
    view.rerender({ source: expiredSource });
    await act(async () => {
      retired.dispatchEvent(new Event(eventName));
      await Promise.resolve();
    });
    expect(renew).not.toHaveBeenCalled();
    await act(async () => {
      replacement.dispatchEvent(new Event(eventName));
      await Promise.resolve();
    });
    expect(renew).toHaveBeenCalledOnce();
    view.unmount();
  },
);

it("binds native use when an initially empty stable ref gains its first playable node", async () => {
  const reference = { current: null as HTMLVideoElement | null };
  const renew = vi.fn().mockResolvedValue(media);
  const view = renderHook(
    ({ source }) => {
      return useVideoSourceRenewal({
        itemId: "item",
        videoRef: reference,
        source,
        renew,
      });
    },
    { initialProps: { source: null as typeof media.playback } },
  );
  reference.current = _video(true);
  view.rerender({
    source: { ...media.playback!, expiresAt: new Date(0).toISOString() },
  });
  await act(async () => {
    reference.current!.dispatchEvent(new Event("seeking"));
    await Promise.resolve();
  });
  expect(renew).toHaveBeenCalledOnce();
  view.unmount();
});
