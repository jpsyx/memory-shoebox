import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeItemDetail,
  SIGNED_IN,
  UPLOADER,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

/** Presses React on the photograph, then one of the six. */
async function _react(word: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /^React$/ }));
  const picker = await screen.findByRole("dialog");
  await userEvent.click(within(picker).getByRole("button", { name: word }));
}

describe("reacting to the photograph", () => {
  it("sends the reaction and draws the server's answer", async () => {
    // Two people by the server's count, where the tap alone draws one: only
    // the answer can say so.
    respondWithItem({
      detail: makeItemDetail(),
      routes: {
        [`PUT /api/items/${ITEM_ID}/reaction`]: {
          body: {
            kinds: [{ kind: "love", count: 2, members: [UPLOADER, SIGNED_IN] }],
            myKind: "love",
          },
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);

    await _react("Love");

    expect(
      await screen.findByRole("button", {
        name: "2 reactions. See who left them",
      }),
    ).toBeVisible();
    expect(
      getRecordedBodyFromRequest(`PUT /api/items/${ITEM_ID}/reaction`),
    ).toEqual({
      kind: "love",
    });
    // The picker is still fading out, and its own "Love" choice has the same
    // name as the action. Only the action carries `aria-expanded`.
    expect(
      screen.getByRole("button", { name: /^Love$/, expanded: false }),
    ).toBeVisible();
  });

  it("offers photo reactions without the explanatory paragraph", async () => {
    respondWithItem({ detail: makeItemDetail() });
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("button", { name: /^React$/ }),
    ).toBeVisible();
    expect(
      screen.queryByText(/A reaction is the whole/),
    ).not.toBeInTheDocument();
  });

  it("puts the reaction back, and says so, when it does not go through", async () => {
    respondWithItem({
      detail: makeItemDetail(),
      routes: {
        [`PUT /api/items/${ITEM_ID}/reaction`]: {
          body: { error: "internal", message: "x" },
          status: 500,
        },
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
