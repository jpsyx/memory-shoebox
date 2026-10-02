import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ITEM_ID, makeItemDetail, SIGNED_IN } from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

/** Presses React on the photograph, then one of the six. */
async function _react(word: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /^React$/ }));
  const picker = await screen.findByRole("dialog");
  await userEvent.click(within(picker).getByRole("button", { name: word }));
}

describe("reacting to the photograph", () => {
  it("sends the reaction and draws the server's answer", async () => {
    respondWithItem(makeItemDetail(), {
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        body: {
          kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
          myKind: "love",
        },
        status: 200,
      },
    });
    renderItem(ITEM_ID);

    await _react("Love");

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        `PUT /api/items/${ITEM_ID}/reaction`,
      );
    });
    // The picker is still fading out, and its own "Love" choice has the same
    // name as the action. Only the action carries `aria-expanded`.
    expect(
      screen.getByRole("button", { name: /^Love$/, expanded: false }),
    ).toBeVisible();
    expect(screen.getByText(/Nobody is emailed about one/)).toBeVisible();
  });

  it("puts the reaction back, and says so, when it does not go through", async () => {
    respondWithItem(makeItemDetail(), {
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        body: { error: "internal", message: "x" },
        status: 500,
      },
    });
    renderItem(ITEM_ID);

    await _react("Love");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That reaction did not go through",
    );
    expect(screen.getByRole("button", { name: /^React$/ })).toBeVisible();
  });
});
