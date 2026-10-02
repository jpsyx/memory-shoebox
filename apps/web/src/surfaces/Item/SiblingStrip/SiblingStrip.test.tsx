import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BURST_ID,
  ITEM_ID,
  makeBurstDetail,
  makeBurstFrame,
  makeItemDetail,
} from "@/testing/itemFixtures";
import { renderItem, respondWithItem } from "@/testing/itemHarness";
import type { Answer } from "@/testing/surfaceHarness";

/** The frames route's answer for a whole run of `count`. */
function _wholeRunAnswer(count: number): Answer {
  return {
    body: {
      frames: Array.from({ length: count }, (_unused, index) => {
        return makeBurstFrame(index + 1);
      }),
      nextCursor: null,
    },
    status: 200,
  };
}

/** A box `width` wide starting `left` pixels from the viewport's edge. */
function _box(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 0,
    width,
    height: 68,
    top: 0,
    left,
    right: left + width,
    bottom: 68,
    toJSON() {
      return this;
    },
  };
}

/**
 * Lays the strip out as a browser would: a 400px window onto 68px frames
 * 72px apart, each frame's box moving left as the strip scrolls right.
 * Everything else keeps the setup file's stand-in.
 */
function _stripLayout(this: Element): DOMRect {
  const position = /^Frame (\d+) of/.exec(
    this.getAttribute("aria-label") ?? "",
  )?.[1];
  if (position !== undefined) {
    const scrolled = this.parentElement?.scrollLeft ?? 0;
    return _box((Number(position) - 1) * 72 - scrolled, 68);
  }
  return this.parentElement?.tagName === "NAV" ? _box(0, 400) : _box(0, 100);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the burst strip", () => {
  it("keeps the run beside the frame, captioned with its span", async () => {
    const detail = makeBurstDetail({ position: 7, count: 45 });
    respondWithItem(detail);
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", {
      name: "45 frames over 3 minutes",
    });
    expect(within(strip).getAllByRole("link")).toHaveLength(45);
    expect(
      within(strip).getByRole("link", { name: "Frame 7 of 45" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByText("Frame 7 of 45", { selector: "span" }),
    ).toBeVisible();
  });

  it("is one tab stop, and the arrow keys move along it", async () => {
    const detail = makeBurstDetail({ position: 7, count: 45 });
    respondWithItem(detail);
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", { name: /45 frames/ });
    const current = within(strip).getByRole("link", { name: "Frame 7 of 45" });
    expect(current).toHaveAttribute("tabindex", "0");
    expect(
      within(strip).getByRole("link", { name: "Frame 8 of 45" }),
    ).toHaveAttribute("tabindex", "-1");

    current.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(
      within(strip).getByRole("link", { name: "Frame 8 of 45" }),
    ).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(
      within(strip).getByRole("link", { name: "Frame 45 of 45" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(
      within(strip).getByRole("link", { name: "Frame 1 of 45" }),
    ).toHaveFocus();
  });

  it("opens a sibling in place of this one, rather than on top of it", async () => {
    const detail = makeBurstDetail({ position: 7 });
    const sibling = makeBurstDetail({ position: 8 });
    respondWithItem(detail, {
      [`GET /api/items/${sibling.itemId}`]: { body: sibling, status: 200 },
    });
    const { router } = renderItem(detail.itemId);

    await userEvent.click(
      await screen.findByRole("link", { name: "Frame 8 of 45" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${sibling.itemId}`);
    });
    expect(router.history.length).toBe(1);
  });

  it("asks the frames route for the whole run when it is longer than the strip", async () => {
    const detail = makeBurstDetail({ position: 61, count: 75 });
    respondWithItem(detail, {
      [`GET /api/bursts/${BURST_ID}/frames`]: _wholeRunAnswer(75),
    });
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", { name: /75 frames/ });
    await waitFor(() => {
      expect(within(strip).getAllByRole("link")).toHaveLength(75);
    });
    expect(
      within(strip).getByRole("link", { name: "Frame 61 of 75" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("keeps your place on a move: focus and scroll stay, the draft goes", async () => {
    const detail = makeBurstDetail({ position: 7 });
    const sibling = makeBurstDetail({ position: 8 });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    respondWithItem(detail, {
      [`GET /api/items/${sibling.itemId}`]: {
        body: sibling,
        status: 200,
        waitFor: held,
      },
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { router } = renderItem(detail.itemId);

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Say something" }),
      "Half a thought",
    );
    const strip = screen.getByRole("navigation", { name: /45 frames/ });
    within(strip).getByRole("link", { name: "Frame 7 of 45" }).focus();
    scrollTo.mockClear();
    await userEvent.keyboard("{ArrowRight}{Enter}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/items/${sibling.itemId}`);
    });
    release();

    // The draft belonged to frame 7, so it goes once frame 8 is drawn.
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Say something" }),
      ).toHaveValue("");
    });
    expect(
      within(strip).getByRole("link", { name: "Frame 8 of 45" }),
    ).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("leaves a held modifier to the browser, so Alt and an arrow is Back", async () => {
    const detail = makeBurstDetail({ position: 7 });
    respondWithItem(detail);
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", { name: /45 frames/ });
    const current = within(strip).getByRole("link", { name: "Frame 7 of 45" });
    current.focus();
    const wasPrevented: boolean[] = [];
    const record = (event: KeyboardEvent) => {
      wasPrevented.push(event.defaultPrevented);
    };
    window.addEventListener("keydown", record);
    await userEvent.keyboard(
      "{Alt>}{ArrowLeft}{/Alt}{Meta>}{ArrowRight}{/Meta}{Control>}{End}{/Control}",
    );
    window.removeEventListener("keydown", record);

    expect(current).toHaveFocus();
    expect(wasPrevented).not.toContain(true);
  });

  it("scrolls the strip, and only the strip, to put the open frame in view", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      _stripLayout,
    );
    const detail = makeBurstDetail({ position: 61, count: 75 });
    respondWithItem(detail, {
      [`GET /api/bursts/${BURST_ID}/frames`]: _wholeRunAnswer(75),
    });
    renderItem(detail.itemId);

    const strip = await screen.findByRole("navigation", { name: /75 frames/ });
    const open = await within(strip).findByRole("link", {
      name: "Frame 61 of 75",
    });
    // Frame 61 starts 4320px in; centring it in a 400px window leaves
    // (400 - 68) / 2 = 166px either side of it.
    await waitFor(() => {
      expect(open.parentElement?.scrollLeft).toBe(4320 - 166);
    });
  });

  it("draws no strip for a photograph outside a burst", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    await screen.findByText("Uploaded by Mamá");
    expect(screen.queryByRole("navigation", { name: /frames/ })).toBeNull();
  });
});
