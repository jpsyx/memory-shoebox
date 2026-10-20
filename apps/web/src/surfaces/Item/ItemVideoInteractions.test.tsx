import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("video conversation interactions", () => {
  it("keeps a later comment pause through pending playing-source renewal", async () => {
    const detail = makeVideoDetail();
    const renewed = {
      ...detail.media,
      playback: {
        ...detail.media.playback!,
        url: "https://example.invalid/comment-pause.mp4",
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
            body: "Stay here.",
            atSeconds: 3,
          }),
        },
      },
    });
    const { container } = renderItem(ITEM_ID);
    const field = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    const video = container.querySelector("video")!;
    let isPaused = false;
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
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {
      isPaused = true;
      fireEvent.pause(video);
    });
    vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(() => {
      isPaused = true;
      fireEvent.pause(video);
    });
    fireEvent.play(video);
    fireEvent.error(video);
    await waitFor(() => {
      expect(video).toHaveAttribute("src", renewed.playback.url);
    });
    const slider = screen.getByRole("slider", { name: "Where in the video" });
    await userEvent.click(slider);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(video.currentTime).toBe(0);
    await userEvent.type(field, "Stay here.");
    expect(slider).toHaveAttribute("aria-valuetext", "0:03 of 0:22");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.loadedMetadata(video);
    await waitFor(() => {
      expect(video.currentTime).toBe(3);
    });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(video.paused).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await screen.findByText("Stay here.");
    expect(
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "Stay here.", atSeconds: 3 });
    expect(getRecordedCountFromLine("POST /api/media/preview")).toBe(1);
    expect(getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`)).toBe(1);
  });

  it.each(["error", "loadedmetadata"])(
    "retains three keyboard seek steps and the captured comment through renewal %s",
    async (completion) => {
      vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
      const detail = makeVideoDetail();
      const renewed = {
        ...detail.media,
        playback: {
          ...detail.media.playback!,
          url: "https://example.invalid/held-renewal.mp4",
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
              body: "That moment.",
              atSeconds: 3,
            }),
          },
        },
      });
      const { container } = renderItem(ITEM_ID);
      const field = await screen.findByRole("textbox", {
        name: "Write a comment",
      });
      const video = container.querySelector("video")!;
      Object.defineProperty(video, "currentSrc", {
        configurable: true,
        get: () => {
          return video.src;
        },
      });
      fireEvent.error(video);
      await waitFor(() => {
        expect(video).toHaveAttribute("src", renewed.playback.url);
      });
      const slider = screen.getByRole("slider", { name: "Where in the video" });
      await userEvent.click(slider);
      await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
      expect(video.currentTime).toBe(0);
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      fireEvent.timeUpdate(video);
      expect(slider).toHaveAttribute("aria-valuetext", "0:03 of 0:22");
      fireEvent(video, new Event(completion));
      if (completion === "error") {
        await screen.findByText("This video couldn’t play");
      } else {
        await waitFor(() => {
          expect(video.currentTime).toBe(3);
        });
      }
      fireEvent.timeUpdate(video);
      expect(slider).toHaveAttribute("aria-valuetext", "0:03 of 0:22");
      await userEvent.click(
        screen.getByRole("button", { name: "Comment on this moment" }),
      );
      await userEvent.type(field, "That moment.");
      await userEvent.click(
        screen.getByRole("button", { name: "Post comment" }),
      );
      await screen.findByText("That moment.");
      expect(
        getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
      ).toEqual({
        body: "That moment.",
        atSeconds: 3,
      });
      expect(
        screen.getByRole("button", { name: /Seek to 0:03:/ }),
      ).toBeVisible();
      expect(video.currentTime).toBe(completion === "error" ? 0 : 3);
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      expect(getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`)).toBe(1);
      expect(getRecordedCountFromLine("POST /api/media/preview")).toBe(1);
      if (completion === "error") {
        await userEvent.click(
          screen.getByRole("button", { name: "Try again" }),
        );
        await waitFor(() => {
          expect(container.querySelector("video")).not.toBe(video);
        });
        fireEvent.timeUpdate(video);
        expect(
          screen.getByRole("slider", { name: "Where in the video" }),
        ).toHaveAttribute("aria-valuetext", "0:00 of 0:22");
      }
    },
  );

  it.each(["Meta", "Control"])(
    "sends the captured comment with %s+Enter",
    async (modifier) => {
      respondWithItem({
        detail: makeVideoDetail(),
        routes: {
          [`POST /api/items/${ITEM_ID}/comments`]: {
            status: 201,
            body: makeComment({
              author: SIGNED_IN,
              body: "That smile!",
              atSeconds: 4,
            }),
          },
        },
      });
      const { container } = renderItem(ITEM_ID);
      const field = await screen.findByRole("textbox", {
        name: "Write a comment",
      });
      const video = container.querySelector("video")!;
      video.currentTime = 4;
      fireEvent.timeUpdate(video);
      await userEvent.type(field, "That smile!");
      await userEvent.keyboard(`{${modifier}>}{Enter}{/${modifier}}`);
      await screen.findByText("That smile!");
      expect(
        getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
      ).toEqual({ body: "That smile!", atSeconds: 4 });
      expect(field).toHaveValue("");
    },
  );

  it("keeps plain Enter as a newline and ignores composing or repeated shortcuts", async () => {
    respondWithItem({ detail: makeVideoDetail() });
    renderItem(ITEM_ID);
    const field = await screen.findByRole("textbox", {
      name: "Write a comment",
    });
    await userEvent.type(field, "First{Enter}Second");
    fireEvent.keyDown(field, {
      key: "Enter",
      metaKey: true,
      isComposing: true,
    });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true, repeat: true });
    expect(field).toHaveValue("First\nSecond");
    expect(
      getRecordedCountFromLine(`POST /api/items/${ITEM_ID}/comments`),
    ).toBe(0);
  });

  it("sends a reply with the same shortcut and its parent moment", async () => {
    const parent = makeComment({ atSeconds: 6 });
    respondWithItem({
      detail: makeVideoDetail({ comments: [parent] }),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 201,
          body: makeComment({
            commentId: "018f0000-0000-7000-8000-00000000d102",
            parentCommentId: parent.commentId,
            author: SIGNED_IN,
            body: "Yes!",
            atSeconds: 6,
          }),
        },
      },
    });
    renderItem(ITEM_ID);
    await userEvent.click(
      await screen.findByRole("button", { name: "Reply to Abuela Rosa" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Reply to Abuela Rosa" }),
      "Yes!",
    );
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await screen.findByText("Yes!");
    expect(
      screen.queryByRole("textbox", { name: "Reply to Abuela Rosa" }),
    ).not.toBeInTheDocument();
    expect(
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "Yes!", parentCommentId: parent.commentId });
  });

  it("retains a reopened reply's words when the cancelled sender later succeeds", async () => {
    const parent = makeComment({ atSeconds: 6 });
    const { hold, letGo } = makeHold();
    respondWithItem({
      detail: makeVideoDetail({ comments: [parent] }),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 201,
          waitFor: hold,
          body: makeComment({
            commentId: "018f0000-0000-7000-8000-00000000d103",
            parentCommentId: parent.commentId,
            author: SIGNED_IN,
            body: "First sent reply",
            atSeconds: 6,
          }),
        },
      },
    });
    renderItem(ITEM_ID);
    await userEvent.click(
      await screen.findByRole("button", { name: "Reply to Abuela Rosa" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Reply to Abuela Rosa" }),
      "First sent reply",
    );
    await userEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reply to Abuela Rosa" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Reply to Abuela Rosa" }),
      "Newer reply words",
    );
    expect(screen.getByRole("button", { name: "Post reply" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await act(async () => {
      letGo();
    });
    await screen.findByText("First sent reply");
    expect(
      screen.getByRole("textbox", { name: "Reply to Abuela Rosa" }),
    ).toHaveValue("Newer reply words");
    expect(
      getRecordedCountFromLine(`POST /api/items/${ITEM_ID}/comments`),
    ).toBe(1);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Post reply" }),
      ).toHaveAttribute("aria-busy", "false");
    });
  });

  it("opens item details in a drawer without replacing the player", async () => {
    respondWithItem({
      detail: makeVideoDetail({ capabilities: OWN_UPLOADER_CAPABILITIES }),
    });
    const { container } = renderItem(ITEM_ID);
    await screen.findByRole("textbox", { name: "Write a comment" });
    const video = container.querySelector("video")!;
    video.currentTime = 7;
    fireEvent.timeUpdate(video);
    expect(
      screen.queryByRole("heading", { name: "In this one" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "React" }),
    ).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More video details" });
    await userEvent.click(more);
    const drawer = await screen.findByRole("dialog", { name: "Video details" });
    await waitFor(() => {
      [
        "In this one",
        "Who can see this",
        "When this was taken",
        "For somebody listening",
      ].forEach((name) => {
        expect(within(drawer).getByRole("heading", { name })).toBeVisible();
      });
    });
    expect(
      within(drawer).getByRole("link", { name: "Download the original" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(container.querySelector("video")).toBe(video);
    expect(video.currentTime).toBe(7);
    await waitFor(() => {
      expect(more).toHaveFocus();
    });
  });
});
