import { act, renderHook } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";

import { useVideoSourceRenewal } from "../videoSourceRenewalHelpers";
import {
  createTestVideo,
  installUseVideoSourceRenewalTestLifecycle,
  media,
} from "./useVideoSourceRenewalTestHelpers";
installUseVideoSourceRenewalTestLifecycle();
describe("video source renewal", () => {
  it.each([true, false])(
    "restores playback after lease replacement (paused=%s)",
    async (paused) => {
      const video = createTestVideo(paused);
      const renew = vi.fn().mockResolvedValue(media);
      const view = renderHook(
        ({ source }) => {
          return useVideoSourceRenewal({
            itemId: "item",
            videoRef: { current: video },
            source: source ?? undefined,
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
});
describe("video source renewal", () => {
  it("does not treat a source-load pause event as a later explicit pause", async () => {
    const video = createTestVideo(false);
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
          source: source ?? undefined,
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
});
describe("video source renewal", () => {
  it("does not reload on unrelated metadata and clamps a shortened duration", async () => {
    const video = createTestVideo(true);
    const renew = vi.fn().mockResolvedValue(media);
    const view = renderHook(
      ({ source }) => {
        return useVideoSourceRenewal({
          itemId: "item",
          videoRef: { current: video },
          source: source ?? undefined,
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
});
describe("video source renewal", () => {
  it("checks expired seeking and allows only one automatic failure across renewed URLs", async () => {
    const video = createTestVideo(true);
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
          source: source ?? undefined,
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
});
describe("video source renewal", () => {
  it("does not classify rejected play as a source transport failure", async () => {
    const video = createTestVideo();
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
          source: source ?? undefined,
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
  const video = createTestVideo();
  const renew = vi.fn().mockResolvedValue(media);
  const view = renderHook(() => {
    return useVideoSourceRenewal({
      itemId: "item",
      videoRef: { current: video },
      source: media.playback ?? undefined,
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
