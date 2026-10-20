import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVideoTransport } from "../../ItemViewer/useVideoTransport";
import { useVideoPlayback } from "../../VideoConversation/useVideoPlayback/useVideoPlayback";
import { useVideoSourceRenewal } from "../../VideoConversation/videoSourceRenewalHelpers/videoSourceRenewalHelpers";
import {
  createTestVideo,
  media,
} from "../../VideoConversation/videoSourceRenewalHelpers/__tests__/useVideoSourceRenewalTestHelpers";
import type { ItemPresentation } from "../../ItemViewer/ItemViewer.types";
import { useTheaterVideoPlayback } from "./useTheaterVideoPlayback";

function setup() {
  const video = createTestVideo(true);
  const renew = vi.fn(async () => {
    return media;
  });
  const preferences = { current: { isMuted: false } };
  const view = renderHook(
    ({ presentation, itemId, node, source }) => {
      const transport = useVideoTransport(itemId);
      transport.videoRef.current = node;
      const playback = useVideoPlayback({
        media,
        transport,
        reactions: [],
        lastAdded: undefined,
      });
      useVideoSourceRenewal({
        itemId,
        videoRef: transport.videoRef,
        source,
        renew,
      });
      useTheaterVideoPlayback({
        itemId,
        presentation,
        transport,
        playback,
        preferences,
      });
      return { transport, playback };
    },
    {
      initialProps: {
        presentation: "page" as ItemPresentation,
        itemId: "first",
        node: video as HTMLVideoElement | null,
        source: media.playback!,
      },
    },
  );
  return {
    video,
    renew,
    preferences,
    view,
    enter: () => {
      return view.rerender({
        presentation: "theater",
        itemId: "first",
        node: video,
        source: media.playback!,
      });
    },
  };
}
afterEach(() => {
  return vi.restoreAllMocks();
});

describe("theater native playback intent", () => {
  it("autoplays a theater-selected node after StrictMode effect recreation", async () => {
    const video = createTestVideo(true);
    const preferences = { current: { isMuted: false } };
    renderHook(
      () => {
        const transport = useVideoTransport("strict-video");
        transport.videoRef.current = video;
        const playback = useVideoPlayback({
          media,
          transport,
          reactions: [],
          lastAdded: undefined,
        });
        useVideoSourceRenewal({
          itemId: "strict-video",
          videoRef: transport.videoRef,
          source: media.playback!,
          renew: async () => {
            return media;
          },
        });
        useTheaterVideoPlayback({
          itemId: "strict-video",
          presentation: "theater",
          transport,
          playback,
          preferences,
        });
      },
      { wrapper: StrictMode },
    );
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledOnce();
    });
  });

  it("does not autoplay page mode, attempts once on entry, and preserves native position/rate/volume", async () => {
    const { video, view, enter } = setup();
    expect(video.play).not.toHaveBeenCalled();
    video.currentTime = 7;
    video.playbackRate = 1.75;
    video.volume = 0.4;
    enter();
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledOnce();
    });
    expect(video.currentTime).toBe(7);
    expect(video.playbackRate).toBe(1.75);
    expect(video.volume).toBe(0.4);
    view.rerender({
      presentation: "theater",
      itemId: "first",
      node: video,
      source: { ...media.playback! },
    });
    expect(video.play).toHaveBeenCalledOnce();
    view.rerender({
      presentation: "page",
      itemId: "first",
      node: video,
      source: media.playback!,
    });
    expect(video.pause).toHaveBeenCalled();
    enter();
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledTimes(2);
    });
  });

  it("carries the native mute preference but resets rate for a new video and retry node", async () => {
    const { video, view, preferences, enter } = setup();
    enter();
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledOnce();
    });
    expect(video.muted).toBe(false);
    act(() => {
      video.muted = true;
      video.dispatchEvent(new Event("volumechange"));
    });
    expect(preferences.current.isMuted).toBe(true);
    const replacement = createTestVideo(true);
    view.rerender({
      presentation: "theater",
      itemId: "second",
      node: replacement,
      source: media.playback!,
    });
    await waitFor(() => {
      return expect(replacement.play).toHaveBeenCalledOnce();
    });
    expect(replacement.muted).toBe(true);
    expect(replacement.playbackRate).toBe(1);
    const retried = createTestVideo(true);
    view.rerender({
      presentation: "theater",
      itemId: "second",
      node: retried,
      source: media.playback!,
    });
    await waitFor(() => {
      return expect(retried.play).toHaveBeenCalledOnce();
    });
    expect(retried.playbackRate).toBe(1);
  });

  it("leaves a rejected autoplay paused without converting policy refusal into load failure", async () => {
    const { video, view, enter } = setup();
    vi.mocked(video.play).mockRejectedValue(
      new DOMException("Not allowed", "NotAllowedError"),
    );
    enter();
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledOnce();
    });
    expect(view.result.current.playback.hasError).toBe(false);
    view.rerender({
      presentation: "theater",
      itemId: "first",
      node: video,
      source: media.playback!,
    });
    expect(video.play).toHaveBeenCalledOnce();
  });

  it.each(["comment", "exit", "retire"])(
    "%s cancels autoplay waiting for real replacement metadata",
    async (action) => {
      const { video, view, enter } = setup();
      const source = {
        ...media.playback!,
        url: "https://example.invalid/theater-renewed.mp4",
      };
      view.rerender({
        presentation: "page",
        itemId: "first",
        node: video,
        source,
      });
      view.rerender({
        presentation: "theater",
        itemId: "first",
        node: video,
        source,
      });
      expect(video.play).not.toHaveBeenCalled();
      if (action === "comment") {
        act(() => {
          return view.result.current.transport.pause();
        });
      }
      if (action === "exit") {
        view.rerender({
          presentation: "page",
          itemId: "first",
          node: video,
          source,
        });
      }
      if (action === "retire") {
        view.unmount();
      }
      await act(async () => {
        return video.dispatchEvent(new Event("loadedmetadata"));
      });
      expect(video.play).not.toHaveBeenCalled();
      if (action === "comment") {
        view.rerender({
          presentation: "theater",
          itemId: "first",
          node: video,
          source,
        });
        expect(video.play).not.toHaveBeenCalled();
        expect(view.result.current.playback.hasError).toBe(false);
      }
      void enter;
    },
  );

  it("does not restart a paused video on ordinary renewal or metadata renders", async () => {
    const { video, view, enter } = setup();
    enter();
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledOnce();
    });
    act(() => {
      return view.result.current.transport.pause();
    });
    vi.mocked(video.play).mockClear();
    view.rerender({
      presentation: "theater",
      itemId: "first",
      node: video,
      source: {
        ...media.playback!,
        url: "https://example.invalid/ordinary-renewal.mp4",
      },
    });
    await act(async () => {
      return video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(video.play).not.toHaveBeenCalled();
  });

  it("waits for a playable node after a blocked source and never starts the retired node", async () => {
    const { video, view } = setup();
    const source = {
      ...media.playback!,
      url: "https://example.invalid/pending-old.mp4",
    };
    view.rerender({
      presentation: "theater",
      itemId: "first",
      node: video,
      source,
    });
    view.rerender({
      presentation: "theater",
      itemId: "second",
      node: null,
      source: media.playback!,
    });
    await act(async () => {
      return video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(video.play).not.toHaveBeenCalled();
    const available = createTestVideo(true);
    view.rerender({
      presentation: "theater",
      itemId: "second",
      node: available,
      source: media.playback!,
    });
    await waitFor(() => {
      return expect(available.play).toHaveBeenCalledOnce();
    });
  });
});
