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

  it("refreshes sources before remounting an explicitly retried player", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    respondWithItem({ detail: makeVideoDetail() });
    const { container } = renderItem(ITEM_ID);
    const originalVideo = await _video(container);
    fireEvent.error(originalVideo);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`)).toBe(2);
    });
    await waitFor(() => {
      expect(container.querySelector("video")).not.toBe(originalVideo);
    });
  });

  it("starts from the contract duration without autoplay and keeps both encodings", async () => {
    respondWithItem({ detail: makeVideoDetail() });
    const { container } = renderItem(ITEM_ID);
    const video = await _video(container);
    expect(screen.getByText("0:00 / 0:22")).toBeVisible();
    expect(video.querySelectorAll("source")).toHaveLength(2);
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
    await _video(container);
    await userEvent.click(
      screen.getByRole("textbox", { name: "Write a comment" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Comment at 0:00; switch to whole video",
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
