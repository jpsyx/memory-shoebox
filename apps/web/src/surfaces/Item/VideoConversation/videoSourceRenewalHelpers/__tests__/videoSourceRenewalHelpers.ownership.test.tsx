import { act, renderHook } from "@testing-library/react";

import { expect, it, vi } from "vitest";

import { useVideoSourceRenewal } from "../videoSourceRenewalHelpers";
import {
  createTestVideo,
  installUseVideoSourceRenewalTestLifecycle,
  media,
} from "./useVideoSourceRenewalTestHelpers";
installUseVideoSourceRenewalTestLifecycle();

it("does not restore an old item after renewal or readiness outlives its node", async () => {
  const oldVideo = createTestVideo();
  const replacement = createTestVideo(true);
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
        source: media.playback ?? undefined,
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
  const video = createTestVideo();
  const reference = { current: video as HTMLVideoElement | null };
  const renew = vi.fn().mockResolvedValue(media);
  const view = renderHook(
    ({ source }) => {
      return useVideoSourceRenewal({
        itemId: "item",
        videoRef: reference,
        source: source ?? undefined,
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
  const video = createTestVideo(true);
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
        source: source ?? undefined,
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
  const video = createTestVideo();
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
    const retired = createTestVideo(true);
    const replacement = createTestVideo(true);
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
          source: source ?? undefined,
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
        source: source ?? undefined,
        renew,
      });
    },
    { initialProps: { source: null as typeof media.playback } },
  );
  reference.current = createTestVideo(true);
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
