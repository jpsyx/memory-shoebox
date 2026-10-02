import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  BURST_ID,
  ITEM_ID,
  makeBurstDetail,
  makeBurstFrame,
  makeItemDetail,
} from "@/testing/itemFixtures";
import { renderItem, respondWithItem } from "@/testing/itemHarness";

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
      [`GET /api/bursts/${BURST_ID}/frames`]: {
        body: {
          frames: Array.from({ length: 75 }, (_unused, index) => {
            return makeBurstFrame(index + 1);
          }),
          nextCursor: null,
        },
        status: 200,
      },
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

  it("draws no strip for a photograph outside a burst", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    await screen.findByText("Uploaded by Mamá");
    expect(screen.queryByRole("navigation", { name: /frames/ })).toBeNull();
  });
});
