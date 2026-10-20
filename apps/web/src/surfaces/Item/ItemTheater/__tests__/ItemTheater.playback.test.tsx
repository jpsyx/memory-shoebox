import { getPhotoCandidateFromViewport } from "@/media/getPhotoCandidateFromViewport/getPhotoCandidateFromViewport";
import { getPhotoViewportFromElement } from "@/media/photoViewportHelpers";
import { itemQueryOptions } from "@/api/items/items";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderItem, respondWithItem } from "@/testing/itemHarnessHelpers";
import { ITEM_ID, makeVideoDetail } from "@/testing/itemFixtureHelpers";
import {
  FIRST,
  MIDDLE,
  LAST,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "../../ItemViewer/ItemNavigation/__tests__/ItemNavigationTestHelpers";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "audioTracks", "get").mockReturnValue(
    undefined as never,
  );
  vi.spyOn(HTMLMediaElement.prototype, "videoTracks", "get").mockReturnValue(
    undefined as never,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared theater playback", () => {
  it("selects photo renditions for the full measured theater stage while preserving page paper bounds", () => {
    const frame = document.createElement("div");
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
      width: 1440,
      height: 900,
    } as DOMRect);
    vi.stubGlobal("innerHeight", 900);
    vi.stubGlobal("devicePixelRatio", 1);
    const candidates = [
      {
        ...FIRST.media.display!,
        width: 1200,
        height: 800,
        url: "https://example.invalid/1200.jpg",
      },
      {
        ...FIRST.media.display!,
        width: 1800,
        height: 1200,
        url: "https://example.invalid/1800.jpg",
      },
    ];
    frame.dataset.appearance = "theater";
    expect(getPhotoViewportFromElement(frame)).toMatchObject({
      cssWidth: 1440,
      cssHeight: 900,
    });
    expect(
      getPhotoCandidateFromViewport({
        ...getPhotoViewportFromElement(frame),
        candidates,
      })?.url,
    ).toBe("https://example.invalid/1800.jpg");
    frame.dataset.appearance = "paper";
    expect(getPhotoViewportFromElement(frame)).toMatchObject({
      cssWidth: 1420,
      cssHeight: 630,
    });
    expect(
      getPhotoCandidateFromViewport({
        ...getPhotoViewportFromElement(frame),
        candidates,
      })?.url,
    ).toBe("https://example.invalid/1200.jpg");
    vi.unstubAllGlobals();
  });

  it("replaces the video fullscreen action with one theater entry and retains its native node and current controls", async () => {
    respondWithItem({ detail: makeVideoDetail() });
    const { container } = renderItem(ITEM_ID);
    const player = await screen.findByLabelText("Video player");
    const video = container.querySelector("video")!;
    expect(video.play).not.toHaveBeenCalled();
    video.currentTime = 9;
    video.playbackRate = 1.5;
    video.volume = 0.35;
    const entry = within(player).getByRole("button", { name: "Enter theater" });
    expect(
      screen.getAllByRole("button", { name: "Enter theater" }),
    ).toHaveLength(1);
    await userEvent.click(entry);
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalledOnce();
    });
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(container.querySelector("video")).toBe(video);
    expect(video.currentTime).toBe(9);
    expect(video.playbackRate).toBe(1.5);
    expect(video.volume).toBe(0.35);
    expect(screen.queryByRole("button", { name: "Enter theater" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "More reactions" }),
    );
    const heart = await screen.findByRole("button", { name: "React: Heart" });
    expect(
      screen.getByRole("dialog", { name: "Media theater" }),
    ).toContainElement(heart);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      screen.getByRole("button", { name: "Comment on this moment" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("group", { name: "React to this moment" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(container.querySelector("video")).toBe(video);
    expect(video.currentTime).toBe(9);
    expect(screen.getByRole("button", { name: "Enter theater" })).toHaveFocus();
  });

  it("enters from a photo then autoplays each selected video with mute carryover and fresh speed", async () => {
    const lastVideo = makeVideoDetail({ itemId: LAST.itemId });
    respondWithNavigationItems({
      order: [FIRST, MIDDLE, lastVideo],
      routes: {
        [`GET /api/items/${LAST.itemId}`]: { status: 200, body: lastVideo },
        [`GET /api/items/${MIDDLE.itemId}/video-reactions`]: {
          status: 200,
          body: [],
        },
        [`GET /api/items/${LAST.itemId}/video-reactions`]: {
          status: 200,
          body: [],
        },
      },
    });
    const { container } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    const photo = container.querySelector("[data-photo-surface=viewer]");
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    expect(container.querySelector("[data-photo-surface=viewer]")).toBe(photo);
    await userEvent.click(
      screen.getByRole("button", { name: "Next photo or video" }),
    );
    await screen.findByLabelText("Video player");
    const video = container.querySelector("video")!;
    await waitFor(() => {
      return expect(video.play).toHaveBeenCalled();
    });
    act(() => {
      video.muted = true;
      fireEvent.volumeChange(video);
      video.playbackRate = 2;
    });
    await waitForNavigationReady();
    await userEvent.click(
      screen.getByRole("button", { name: "Next photo or video" }),
    );
    await waitFor(() => {
      return expect(container.querySelector("video")).not.toBe(video);
    });
    const replacement = container.querySelector("video")!;
    await waitFor(() => {
      return expect(replacement.muted).toBe(true);
    });
    expect(replacement.playbackRate).toBe(1);
    expect(container.querySelectorAll("video")).toHaveLength(1);
  });

  it("keeps rejected autoplay usable and metadata edits do not create another attempt", async () => {
    const detail = makeVideoDetail();
    respondWithItem({ detail });
    const { container, router } = renderItem(ITEM_ID);
    await screen.findByLabelText("Video player");
    const video = container.querySelector("video")!;
    const play = vi
      .spyOn(video, "play")
      .mockRejectedValue(new DOMException("Policy refused", "NotAllowedError"));
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    await waitFor(() => {
      return expect(play).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("button", { name: "Play video" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    act(() => {
      router.options.context!.queryClient.setQueryData(
        itemQueryOptions(ITEM_ID).queryKey,
        {
          ...detail,
          altTextOverride: "A metadata edit",
          media: { ...detail.media, altText: "A metadata edit" },
        },
      );
    });
    await screen.findByLabelText("A metadata edit");
    expect(container.querySelector("video")).toBe(video);
    expect(play).toHaveBeenCalledOnce();
  });

  it("autoplays the first actual playable node after a blocked source becomes available", async () => {
    const detail = makeVideoDetail();
    respondWithItem({
      detail: { ...detail, media: { ...detail.media, playback: null } },
    });
    const { container, router } = renderItem(ITEM_ID);
    await screen.findByLabelText("Video player");
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    expect(container.querySelector("video")).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    act(() => {
      return router.options.context!.queryClient.setQueryData(
        itemQueryOptions(ITEM_ID).queryKey,
        detail,
      );
    });
    await waitFor(() => {
      return expect(container.querySelector("video")).not.toBeNull();
    });
    await waitFor(() => {
      return expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    });
    expect(container.querySelectorAll("video")).toHaveLength(1);
  });

  it("retries through the existing media lease and autoplays only its fresh native node", async () => {
    const detail = makeVideoDetail();
    const renewed = {
      ...detail.media,
      playback: {
        ...detail.media.playback!,
        url: "https://example.invalid/theater-retry.mp4",
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
      },
    });
    const { container } = renderItem(ITEM_ID);
    await screen.findByLabelText("Video player");
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "currentSrc", {
      configurable: true,
      get: () => {
        return video.src;
      },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    await waitFor(() => {
      return expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    });
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    fireEvent.error(video);
    await waitFor(() => {
      return expect(video).toHaveAttribute("src", renewed.playback.url);
    });
    await act(async () => {
      return fireEvent.loadedMetadata(video);
    });
    fireEvent.error(video);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    await waitFor(() => {
      return expect(container.querySelector("video")).not.toBe(video);
    });
    const replacement = container.querySelector("video")!;
    Object.defineProperty(replacement, "currentSrc", {
      configurable: true,
      get: () => {
        return replacement.src;
      },
    });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => {
      return fireEvent.loadedMetadata(replacement);
    });
    await waitFor(() => {
      return expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toEqual([
      replacement,
    ]);
    expect(replacement.playbackRate).toBe(1);
    expect(container.querySelectorAll("video")).toHaveLength(1);
  });

  it("a real comment pause supersedes autoplay queued behind source renewal", async () => {
    const detail = makeVideoDetail();
    const renewed = {
      ...detail.media,
      playback: {
        ...detail.media.playback!,
        url: "https://example.invalid/theater-renewal.mp4",
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
      },
    });
    const { container } = renderItem(ITEM_ID);
    await screen.findByLabelText("Video player");
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "currentSrc", {
      configurable: true,
      get: () => {
        return video.src;
      },
    });
    fireEvent.error(video);
    await waitFor(() => {
      return expect(video).toHaveAttribute("src", renewed.playback.url);
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Enter theater" }),
    );
    expect(video.play).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Comment on this moment" }),
    );
    await act(async () => {
      return fireEvent.loadedMetadata(video);
    });
    expect(video.play).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
