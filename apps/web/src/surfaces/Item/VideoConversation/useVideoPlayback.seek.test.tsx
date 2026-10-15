import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeVideoDetail } from "@/testing/itemFixtureHelpers";
import { useVideoTransport } from "../ItemViewer/useVideoTransport";
import { useVideoPlayback } from "./useVideoPlayback";
import { useVideoSourceRenewal } from "./useVideoSourceRenewal";

const media = makeVideoDetail().media;
function _video(paused = true): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperties(video, {
    paused: { configurable: true, value: paused },
    duration: { configurable: true, value: 22 },
    currentSrc: {
      get: () => {
        return video.src;
      },
    },
  });
  video.load = vi.fn();
  video.pause = vi.fn();
  video.play = vi.fn().mockResolvedValue(undefined);
  return video;
}
function _render(video = _video()) {
  const initialProps = { itemId: "first", video, source: media.playback! };
  const view = renderHook(
    (props: typeof initialProps) => {
      const transport = useVideoTransport(props.itemId);
      transport.videoRef.current = props.video;
      useVideoSourceRenewal({
        itemId: props.itemId,
        videoRef: transport.videoRef,
        source: props.source,
        renew: async () => {
          return media;
        },
      });
      const playback = useVideoPlayback({
        media,
        transport,
        reactions: [],
        lastAdded: undefined,
      });
      return { transport, playback };
    },
    { initialProps },
  );
  const pendingProps = {
    ...initialProps,
    source: { ...media.playback!, url: "https://example.invalid/pending.mp4" },
  };
  view.rerender(pendingProps);
  return { view, video, pendingProps };
}

describe("owned logical video seeking", () => {
  it.each([true, false])(
    "applies only the latest target after readiness, paused=%s",
    async (paused) => {
      const { view, video } = _render(_video(paused));
      const writes = vi.spyOn(video, "currentTime", "set");
      for (let step = 0; step < 3; step += 1) {
        act(() => {
          view.result.current.playback.seek(
            view.result.current.transport.position + 1,
          );
        });
      }
      expect(view.result.current.transport.position).toBe(3);
      act(() => {
        view.result.current.playback.onSeeked();
      });
      expect(view.result.current.transport.position).toBe(3);
      expect(writes).not.toHaveBeenCalled();
      expect(video.play).not.toHaveBeenCalled();
      await act(async () => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });
      expect(video.currentTime).toBe(3);
      expect(
        writes.mock.calls.map(([position]) => {
          return position;
        }),
      ).toEqual([0, 3]);
      expect(video.play).toHaveBeenCalledTimes(paused ? 0 : 1);
      video.currentTime = paused ? 3 : 3.125;
      act(() => {
        view.result.current.playback.onSeeked();
      });
      expect(view.result.current.transport.position).toBe(video.currentTime);
      video.currentTime = 4.375;
      act(() => {
        view.result.current.playback.onTimeUpdate(video);
      });
      expect(view.result.current.transport.position).toBe(4.375);
    },
  );

  it.each(["item", "node", "rendition", "unmount"])(
    "retires pending seek on %s replacement",
    async (owner) => {
      const { view, video, pendingProps } = _render();
      act(() => {
        view.result.current.playback.seek(3, true);
      });
      const replacement = owner === "node" ? _video() : video;
      if (owner === "unmount") {
        view.unmount();
      } else {
        view.rerender({
          ...pendingProps,
          itemId: owner === "item" ? "second" : pendingProps.itemId,
          video: replacement,
          source:
            owner === "rendition"
              ? {
                  ...pendingProps.source,
                  renditionId: "replacement",
                  url: "https://example.invalid/replacement.mp4",
                }
              : pendingProps.source,
        });
      }
      await act(async () => {
        video.dispatchEvent(new Event("loadedmetadata"));
        replacement.dispatchEvent(new Event("loadedmetadata"));
      });
      expect(video.currentTime).toBe(0);
      expect(replacement.currentTime).toBe(0);
      expect(video.play).not.toHaveBeenCalled();
      expect(replacement.play).not.toHaveBeenCalled();
      if (owner !== "unmount") {
        expect(view.result.current.transport.position).toBe(0);
        expect(view.result.current.playback.hasError).toBe(false);
      }
    },
  );
});
