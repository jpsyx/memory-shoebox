import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ITEM_ID, makeItemDetail } from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

/** How many times the page asked for one item, which is how many opens. */
function _opensOf(itemId: string): number {
  return recordedRequests().filter((line) => {
    return line === `GET /api/items/${itemId}`;
  }).length;
}

describe("the item page", () => {
  it("says not here for an address that is not an item's, and asks for nothing", async () => {
    respondWithItem(makeItemDetail());
    renderItem("abc");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This one is not here.",
      }),
    ).toBeVisible();
    expect(
      recordedRequests().some((line) => {
        return line.includes("/api/items/abc");
      }),
    ).toBe(false);
  });

  it("says not here, in the same words, when the server answers 404", async () => {
    respondWithItem(makeItemDetail());
    renderItem("018f0000-0000-7000-8000-00000000f999");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This one is not here.",
      }),
    ).toBeVisible();
  });

  it("says it did not open on a server fault, and asks again when told to", async () => {
    respondWithItem(makeItemDetail(), {
      [`GET /api/items/${ITEM_ID}`]: {
        body: { error: "internal", message: "x" },
        status: 500,
      },
    });
    renderItem(ITEM_ID);

    const tryAgain = await screen.findByRole("button", { name: "Try again" });
    // Counted at the press, because the query already retried a 5xx once
    // on its own (`itemQueryOptions`) before the page said it failed.
    const opensBeforePress = _opensOf(ITEM_ID);
    await userEvent.click(tryAgain);

    await waitFor(() => {
      expect(_opensOf(ITEM_ID)).toBeGreaterThan(opensBeforePress);
    });
  });

  it("draws the photograph full frame, with its composed alt text", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("img", {
        name: "Mateo, Papá and Mamá, 14 September 2026",
      }),
    ).toHaveAttribute("src", "https://example.invalid/display.jpg");
  });

  it("gives the page a heading a screen reader can land on", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "A photograph from 14 September 2026",
      }),
    ).toBeInTheDocument();
  });

  it("says when it was taken on the camera's own clock, and who put it up", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(await screen.findByText("14 September 2026, 6:41 am")).toBeVisible();
    expect(screen.getByText("Uploaded by Mamá")).toBeVisible();
  });

  it("goes back to the day it was taken when there is no history to go back through", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("link", { name: "Back to 14 September" }),
    ).toHaveAttribute("href", "/?at=2026-09-14");
  });
});
