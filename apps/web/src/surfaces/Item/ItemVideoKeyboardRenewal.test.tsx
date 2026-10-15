import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as playbackModule from "./VideoConversation/useVideoPlayback";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

const useRealPlayback = playbackModule.useVideoPlayback;
let playback: playbackModule.VideoPlayback;
const controls = [
  { surface: "toolbar", key: "{Enter}", paused: "Play", playing: "Pause" },
  { surface: "toolbar", key: " ", paused: "Play", playing: "Pause" },
  {
    surface: "overlay",
    key: "{Enter}",
    paused: "Play video",
    playing: "Pause video",
  },
  {
    surface: "overlay",
    key: " ",
    paused: "Play video",
    playing: "Pause video",
  },
];

beforeEach(() => {
  // Capture the real owner's command interface without replacing its behavior.
  vi.spyOn(playbackModule, "useVideoPlayback").mockImplementation((options) => {
    playback = useRealPlayback(options);
    return playback;
  });
  vi.spyOn(HTMLMediaElement.prototype, "audioTracks", "get").mockReturnValue(
    undefined as never,
  );
  vi.spyOn(HTMLMediaElement.prototype, "videoTracks", "get").mockReturnValue(
    undefined as never,
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function _respond(): string {
  const detail = makeVideoDetail();
  const renewed = {
    ...detail.media,
    playback: {
      ...detail.media.playback!,
      url: "https://example.invalid/keyboard-renewal.mp4",
    },
  };
  respondWithItem({
    detail,
    routes: {
      "POST /api/media/preview": {
        status: 200,
        body: {
          items: [
            {
              itemId: ITEM_ID,
              kind: "video",
              width: detail.media.width,
              height: detail.media.height,
              media: renewed,
            },
          ],
        },
      },
      [`POST /api/items/${ITEM_ID}/comments`]: {
        status: 201,
        body: makeComment({
          author: SIGNED_IN,
          body: "Keyboard moment.",
          atSeconds: 3,
        }),
      },
    },
  });
  return renewed.playback.url;
}

async function _pendingVideo(isInitiallyPaused: boolean) {
  const renewedUrl = _respond();
  const view = renderItem(ITEM_ID);
  const field = await screen.findByRole("textbox", { name: "Write a comment" });
  const video = view.container.querySelector("video")!;
  let isPaused = isInitiallyPaused;
  Object.defineProperties(video, {
    paused: {
      configurable: true,
      get: () => {
        return isPaused;
      },
    },
    currentSrc: {
      configurable: true,
      get: () => {
        return video.src;
      },
    },
  });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {
    isPaused = true;
    fireEvent.pause(video);
  });
  const play = vi.spyOn(video, "play").mockImplementation(async () => {
    isPaused = false;
    fireEvent.play(video);
  });
  if (!isPaused) {
    fireEvent.play(video);
  }
  fireEvent.error(video);
  await waitFor(() => {
    expect(video).toHaveAttribute("src", renewedUrl);
  });
  return { video, field, pause, play, view };
}

async function _activate(name: string, key: string): Promise<void> {
  const button = screen.getByRole("button", { name });
  button.focus();
  expect(button).toHaveFocus();
  await userEvent.keyboard(key);
}

describe("real video button keyboard renewal ownership", () => {
  it.each(controls)(
    "$surface $key pause supersedes queued seek-and-play and retains its comment time",
    async (control) => {
      const { video, field, pause, play } = await _pendingVideo(false);
      act(() => {
        playback.seek(3, true);
      });
      await _activate(control.playing, control.key);
      expect(pause).toHaveBeenCalledOnce();
      expect(video.paused).toBe(true);
      expect(video.currentTime).toBe(0);
      await act(async () => {
        fireEvent.loadedMetadata(video);
      });
      expect(video.currentTime).toBe(3);
      expect(play).not.toHaveBeenCalled();
      await userEvent.type(field, "Keyboard moment.");
      await userEvent.click(
        screen.getByRole("button", { name: "Post comment" }),
      );
      await screen.findByText("Keyboard moment.");
      expect(
        getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
      ).toEqual({ body: "Keyboard moment.", atSeconds: 3 });
      await _activate(control.paused, control.key);
      expect(play).toHaveBeenCalledOnce();
      expect(video.paused).toBe(false);
    },
  );

  it.each(controls)(
    "$surface $key play awaits replacement readiness and activates exactly once",
    async (control) => {
      const { video, play } = await _pendingVideo(true);
      await _activate(control.paused, control.key);
      expect(play).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.loadedMetadata(video);
      });
      expect(play).toHaveBeenCalledOnce();
      expect(video.paused).toBe(false);
    },
  );

  it.each(controls)(
    "retires pending $surface $key play with the actual consumer",
    async (control) => {
      const { video, play, view } = await _pendingVideo(true);
      await _activate(control.paused, control.key);
      view.unmount();
      await act(async () => {
        fireEvent.loadedMetadata(video);
      });
      expect(play).not.toHaveBeenCalled();
    },
  );
});
