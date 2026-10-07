import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("video conversation interactions", () => {
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
      getRecordedBodyFromRequest(`POST /api/items/${ITEM_ID}/comments`),
    ).toEqual({ body: "Yes!", parentCommentId: parent.commentId });
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
