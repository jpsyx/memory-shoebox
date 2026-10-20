import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function _video(container: HTMLElement): Promise<HTMLVideoElement> {
  await screen.findByRole("textbox", { name: "Write a comment" });
  return container.querySelector("video")!;
}

describe("video conversations", () => {
  it("uses the explicit original playback source when an optimized copy is absent", async () => {
    const detail = makeVideoDetail();
    respondWithItem({
      detail: {
        ...detail,
        media: {
          ...detail.media,
          playback: {
            ...detail.media.playback!,
            purpose: "original",
            contentType: "video/quicktime",
            url: "https://b2/original.mov",
          },
        },
      },
    });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    expect(video.querySelector("source")).toHaveAttribute(
      "src",
      "https://b2/original.mov",
    );
    expect(video.querySelector("source")).toHaveAttribute(
      "type",
      "video/quicktime",
    );
    expect(
      screen.queryByText("This video couldn’t play"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play video" })).toBeEnabled();
  });

  it("waits for reaction read recovery before accepting a gesture", async () => {
    respondWithItem({
      detail: makeVideoDetail(),
      routes: {
        [`GET /api/items/${ITEM_ID}/video-reactions`]: {
          status: 500,
          body: { error: "internal", message: "Failed" },
        },
      },
    });
    renderItem(ITEM_ID);
    await screen.findByText(/Reactions couldn’t load/);
    expect(screen.getByRole("button", { name: "React: Laugh" })).toBeDisabled();
  });

  it("renews selected original without counting another open and requires explicit retry after the second failure", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const detail = makeVideoDetail();
    detail.media.playback = { ...detail.media.playback!, purpose: "original" };
    const renewed = {
      ...detail.media,
      playback: {
        ...detail.media.playback,
        url: "https://example.invalid/renewed.mp4",
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
    const originalVideo = await _video(container);
    fireEvent.error(originalVideo);
    await waitFor(() => {
      return expect(originalVideo).toHaveAttribute("src", renewed.playback.url);
    });
    fireEvent.loadedMetadata(originalVideo);
    fireEvent.error(originalVideo);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    await waitFor(() => {
      return expect(container.querySelector("video")).not.toBe(originalVideo);
    });
    const detailGets = getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`);
    expect(detailGets).toBe(1);
    expect(getRecordedBodyFromRequest("POST /api/media/preview")).toEqual({
      itemIds: [ITEM_ID],
      purpose: "selected-view",
    });
    expect(container.querySelector("source")).toHaveAttribute(
      "src",
      renewed.playback.url,
    );
  });

  it("starts from the contract duration without autoplay and uses explicit playback", async () => {
    respondWithItem({ detail: makeVideoDetail() });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    expect(screen.getByText("0:00 / 0:22")).toBeVisible();
    expect(video.querySelectorAll("source")).toHaveLength(1);
    expect(video.querySelector("source")).toHaveAttribute("type", "video/mp4");
    expect(video).not.toHaveAttribute("autoplay");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("captures once on focus, pauses, and preserves the time through seeking and failed sends", async () => {
    respondWithItem({
      detail: makeVideoDetail(),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 500,
          body: { error: "server_error", message: "Failed" },
        },
      },
    });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    video.currentTime = 4.37;
    fireEvent.timeUpdate(video);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Write a comment" }),
      "There.",
    );
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    video.currentTime = 13;
    fireEvent.timeUpdate(video);
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await screen.findByRole("alert");
    expect(
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "There.", atSeconds: 4.37 });
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toHaveValue("There.");
    expect(
      screen.getByRole("button", {
        name: "Comment at 0:04; switch to whole video",
      }),
    ).toBeVisible();
  });
  it.each([0, 0.5, 0.999])(
    "keeps a comment at %s seconds on the whole video through focus and attachment",
    async (position) => {
      respondWithItem({ detail: makeVideoDetail() });
      const { container } = renderItem(ITEM_ID);
      const video = await _video(container);
      video.currentTime = position;
      fireEvent.timeUpdate(video);
      await userEvent.type(
        screen.getByRole("textbox", { name: "Write a comment" }),
        "All of it.",
      );
      const wholeVideo = screen.getByRole("button", {
        name: "Whole video; attach current moment",
      });
      expect(wholeVideo).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(wholeVideo);
      expect(wholeVideo).toHaveTextContent("Whole video");
      expect(wholeVideo).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(
        screen.getByRole("button", { name: "Post comment" }),
      );
      await waitFor(() => {
        expect(
          getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
        ).toEqual({ body: "All of it.", atSeconds: null });
      });
    },
  );

  it("keeps whole video when attaching at zero after clearing a later moment", async () => {
    respondWithItem({ detail: makeVideoDetail() });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    video.currentTime = 4.37;
    fireEvent.timeUpdate(video);
    await userEvent.click(
      screen.getByRole("textbox", { name: "Write a comment" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Comment at 0:04; switch to whole video",
      }),
    );
    video.currentTime = 0;
    fireEvent.timeUpdate(video);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Whole video; attach current moment",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Whole video; attach current moment",
      }),
    ).toHaveAttribute("aria-pressed", "false");
    video.currentTime = 1;
    fireEvent.timeUpdate(video);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Whole video; attach current moment",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Comment at 0:01; switch to whole video",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps whole-video choice on refocus and clears only after success", async () => {
    respondWithItem({
      detail: makeVideoDetail(),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 201,
          body: makeComment({ author: SIGNED_IN, body: "All of it." }),
        },
      },
    });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    video.currentTime = 4.37;
    fireEvent.timeUpdate(video);
    await userEvent.click(
      screen.getByRole("textbox", { name: "Write a comment" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Comment at 0:04; switch to whole video",
      }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Write a comment" }),
      "All of it.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await screen.findByText("All of it.");
    expect(
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "All of it.", atSeconds: null });
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toHaveValue("");
  });
  it("shows one-level replies and sends the parent without a new timestamp", async () => {
    const parent = makeComment({ atSeconds: 11 });
    respondWithItem({
      detail: makeVideoDetail({ comments: [parent] }),
      routes: {
        [`POST /api/items/${ITEM_ID}/comments`]: {
          status: 201,
          body: makeComment({
            commentId: "018f0000-0000-7000-8000-00000000d102",
            parentCommentId: parent.commentId,
            atSeconds: 11,
            author: SIGNED_IN,
            body: "Yes!",
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
    await userEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await screen.findByText("Yes!");
    expect(
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "Yes!", parentCommentId: parent.commentId });
    expect(screen.getAllByRole("button", { name: /Reply to/ })).toHaveLength(1);
  });
  it("opens a single comment from its marker and restores focus on Escape", async () => {
    const comment = makeComment({
      atSeconds: 11,
      body: "That little wave!\nSo sweet.",
    });
    respondWithItem({ detail: makeVideoDetail({ comments: [comment] }) });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    const marker = screen.getByRole("button", {
      name: /Seek to 0:11: Abuela Rosa/,
    });
    await userEvent.click(marker);
    const list = await screen.findByRole("list", { name: "Moments near 0:11" });
    await waitFor(() => {
      expect(
        within(list).getByText("Abuela Rosa", { exact: true }),
      ).toBeVisible();
      expect(
        within(list).getByText("That little wave! So sweet."),
      ).toBeVisible();
    });
    expect(video.currentTime).toBe(11);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("list", { name: "Moments near 0:11" }),
      ).not.toBeInTheDocument();
      expect(marker).toHaveFocus();
    });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(
        screen.getByRole("list", { name: "Moments near 0:11" }),
      ).toBeVisible();
    });
  });

  it("seeks from comments and groups nearby moments in an accessible list", async () => {
    const comment = makeComment({ atSeconds: 11 });
    respondWithItem({
      detail: makeVideoDetail({
        comments: [
          comment,
          makeComment({
            commentId: "018f0000-0000-7000-8000-00000000d102",
            atSeconds: 11.1,
          }),
        ],
      }),
    });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    await userEvent.click(
      screen.getByRole("button", { name: "2 moments near 0:11" }),
    );
    const list = await screen.findByRole("list", { name: "Moments near 0:11" });
    expect(list.closest('[aria-label="Video player"]')).not.toBeNull();
    await userEvent.click(
      within(list).getAllByRole("button", { name: /Seek to/ })[0]!,
    );
    await waitFor(() => {
      expect(video.currentTime).toBe(11);
    });
  });
});
