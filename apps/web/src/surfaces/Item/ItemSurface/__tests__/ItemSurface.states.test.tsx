import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeBurstDetail,
  makeItemDetail,
} from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";
import { renderAt, type Answer } from "@/testing/surfaceHarness";

/** How many times the page asked for one item, which is how many opens. */
function _opensOf(itemId: string): number {
  return recordedRequests().filter((line) => {
    return line === `GET /api/items/${itemId}`;
  }).length;
}

/** What a server answers for an item that is not there. */
const NOT_FOUND = { error: "not_found", message: "No such item." };

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

  it("says not here, in the same words, when the server answers 400", async () => {
    respondWithItem(makeItemDetail(), {
      [`GET /api/items/${ITEM_ID}`]: {
        body: { error: "invalid_request", message: "x" },
        status: 400,
      },
    });
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This one is not here.",
      }),
    ).toBeVisible();
  });

  it("turns into not here when a write finds the item gone", async () => {
    const opening: Answer = { body: makeItemDetail(), status: 200 };
    respondWithItem(makeItemDetail(), {
      [`GET /api/items/${ITEM_ID}`]: opening,
    });
    renderItem(ITEM_ID);

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Say something" }),
      "Still there?",
    );
    // Gone from here on: the send answers 404, the harness's default, and
    // so does the one read the refusal sends to catch up.
    opening.status = 404;
    opening.body = NOT_FOUND;
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

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

  it("draws no other frame while trying a failed sibling again", async () => {
    const detail = makeBurstDetail({ position: 7 });
    const sibling = makeBurstDetail({ position: 8 });
    const siblingAnswer: Answer = {
      body: { error: "internal", message: "x" },
      status: 500,
    };
    respondWithItem(detail, {
      [`GET /api/items/${sibling.itemId}`]: siblingAnswer,
    });
    renderItem(detail.itemId);

    await userEvent.click(
      await screen.findByRole("link", { name: "Frame 8 of 45" }),
    );
    const tryAgain = await screen.findByRole("button", { name: "Try again" });
    // It answers this time, but slowly.
    let release = () => {};
    siblingAnswer.waitFor = new Promise<void>((resolve) => {
      release = resolve;
    });
    siblingAnswer.status = 200;
    siblingAnswer.body = sibling;
    await userEvent.click(tryAgain);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Opening it" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Frame 7 of 45", { selector: "span" }),
    ).toBeNull();
    release();
    expect(
      await screen.findByText("Frame 8 of 45", { selector: "span" }),
    ).toBeVisible();
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

  it("goes back through history when it was opened from the pile", async () => {
    respondWithItem(makeItemDetail());
    const { router } = renderAt("/?tag=hospital");
    await waitFor(() => {
      expect(router.state.status).toBe("idle");
    });
    await router.navigate({
      to: "/items/$itemId",
      params: { itemId: ITEM_ID },
    });

    await userEvent.click(
      await screen.findByRole("link", { name: "Back to 14 September" }),
    );

    // Back, not a push of `/?at=`: the pile as it was, filter and all.
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ tag: ["hospital"] });
    });
    expect(router.history.length).toBe(2);
  });

  it("goes back through history from not here too", async () => {
    respondWithItem(makeItemDetail());
    const { router } = renderAt("/?tag=hospital");
    await waitFor(() => {
      expect(router.state.status).toBe("idle");
    });
    await router.navigate({ to: "/items/$itemId", params: { itemId: "abc" } });

    await userEvent.click(
      await screen.findByRole("link", { name: "Back to the pile" }),
    );

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ tag: ["hospital"] });
    });
    expect(router.history.length).toBe(2);
  });
});
