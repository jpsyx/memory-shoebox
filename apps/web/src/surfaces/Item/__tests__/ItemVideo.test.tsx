import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeVideoDetail,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedBodyOf,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const PINNED = makeComment({ atSeconds: 11 });

/** What the server answers once the viewer pins a comment at 0:04. */
const MINE = makeComment({
  commentId: "018f0000-0000-7000-8000-00000000d109",
  author: SIGNED_IN,
  body: "That little sigh.",
  atSeconds: 4,
});

beforeEach(() => {
  // jsdom implements no playback, and says so on the console when asked.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The transport's slider. */
async function _slider(): Promise<HTMLElement> {
  return screen.findByRole("slider", { name: "Where in the video" });
}

describe("one video", () => {
  it("stands on its transport, with its runtime and no strip", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    expect(await _slider()).toHaveAttribute("aria-valuetext", "0:00 of 0:22");
    expect(screen.getByText("0:22", { selector: "span" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: /frames/ })).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A video from 14 September 2026",
      }),
    ).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("puts each pinned comment on the scrubber, from the contract's duration", async () => {
    respondWithItem(makeVideoDetail({ comments: [PINNED] }));
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("button", {
        name: "Jump to Abuela Rosa's comment at 0:11",
      }),
    ).toHaveStyle({ left: "50%" });
    expect(
      screen.getByRole("heading", { name: "1 comment, 1 pinned to a moment" }),
    ).toBeVisible();
  });

  it("pins a comment at the moment the transport stands, and its mark appears", async () => {
    respondWithItem(makeVideoDetail(), {
      [`POST /api/items/${ITEM_ID}/comments`]: { body: MINE, status: 201 },
    });
    renderItem(ITEM_ID);

    const slider = await _slider();
    slider.focus();
    await userEvent.keyboard(
      "{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );

    expect(
      screen.getByRole("button", { name: "Pinned at 0:04" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something at 0:04" }),
      "That little sigh.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByRole("button", {
        name: "Jump to Papá's comment at 0:04",
      }),
    ).toBeVisible();
    expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/comments`)).toEqual({
      body: "That little sigh.",
      atSeconds: 4,
    });
    expect(screen.getByRole("textbox", { name: "Say something" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    ).toBeVisible();
  });

  it("pins at the moment playback reached, unrounded", async () => {
    respondWithItem(makeVideoDetail(), {
      [`POST /api/items/${ITEM_ID}/comments`]: {
        body: makeComment({ author: SIGNED_IN, atSeconds: 4.37 }),
        status: 201,
      },
    });
    const { container } = renderItem(ITEM_ID);

    const slider = await _slider();
    const video = container.querySelector("video")!;
    video.currentTime = 4.37;
    fireEvent.timeUpdate(video);
    expect(slider).toHaveAttribute("aria-valuetext", "0:04 of 0:22");
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Say something at 0:04" }),
      "There.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(recordedBodyOf(`POST /api/items/${ITEM_ID}/comments`)).toEqual({
        body: "There.",
        atSeconds: 4.37,
      });
    });
  });

  it("moves the pin with the bar while one is set", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    const slider = await _slider();
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("button", { name: "Pinned at 0:01" }),
    ).toBeVisible();
  });

  it("takes the pin away with Unpin", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    await _slider();
    await userEvent.click(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin" }));

    expect(
      screen.getByRole("button", { name: "Pin a comment to this moment" }),
    ).toBeVisible();
    // Unpin goes as it is pressed, so focus lands in the field it was beside.
    expect(
      screen.getByRole("textbox", { name: "Say something" }),
    ).toHaveFocus();
  });

  it("plays from a pinned comment's moment when its stamp is pressed", async () => {
    respondWithItem(makeVideoDetail({ comments: [PINNED] }));
    renderItem(ITEM_ID);

    const talk = await screen.findByRole("region", { name: "Comments" });
    await userEvent.click(
      within(talk).getByRole("button", {
        name: "0:11 Play the video from here",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("slider", { name: "Where in the video" }),
      ).toHaveAttribute("aria-valuetext", "0:11 of 0:22");
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("explains, with nothing said yet, that a comment can stand at a moment", async () => {
    respondWithItem(makeVideoDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByText(/can stand at a moment in the video/),
    ).toBeVisible();
  });
});
