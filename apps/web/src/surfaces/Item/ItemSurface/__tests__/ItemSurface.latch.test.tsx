import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  makeBurstDetail,
  makeComment,
  makeFrameIdFromPosition,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
} from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

const DETAIL = makeBurstDetail(
  { position: 7, count: 45 },
  { capabilities: OWN_UPLOADER_CAPABILITIES },
);

/** Every `GET` of any item's permalink, which is every open counted. */
function _opens(): string[] {
  return recordedRequests().filter((line) => {
    return /^GET \/api\/items\/[0-9a-f-]+$/u.test(line);
  });
}

describe("what opening an item latches", () => {
  it("counts one open for one arrival, and latches nothing of its own", async () => {
    respondWithItem(DETAIL);
    renderItem(DETAIL.itemId);

    await screen.findByRole("navigation", { name: /45 frames/ });

    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
    expect(
      recordedRequests().some((line) => {
        return line.includes("/api/items/seen");
      }),
    ).toBe(false);
  });

  it("sends nothing when a link to another item is preloaded", async () => {
    respondWithItem(DETAIL);
    const { router } = renderItem(DETAIL.itemId);
    await screen.findByRole("navigation", { name: /45 frames/ });

    await router.preloadRoute({
      to: "/items/$itemId",
      params: { itemId: makeFrameIdFromPosition(8) },
    });

    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
  });

  it("still counts one open after a comment, a reaction and a tag", async () => {
    respondWithItem(DETAIL, {
      [`POST /api/items/${DETAIL.itemId}/comments`]: {
        body: makeComment({ author: SIGNED_IN, body: "Hello." }),
        status: 201,
      },
      [`PUT /api/items/${DETAIL.itemId}/reaction`]: {
        body: {
          kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
          myKind: "love",
        },
        status: 200,
      },
      [`PUT /api/items/${DETAIL.itemId}/tags`]: { body: DETAIL, status: 200 },
    });
    renderItem(DETAIL.itemId);

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Say something" }),
      "Hello.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Hello.");

    await userEvent.click(
      screen.getAllByRole("button", { name: /^React$/ })[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Love",
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "+ Add a tag" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "beach{enter}",
    );

    await waitFor(() => {
      expect(recordedRequests()).toContain(
        `PUT /api/items/${DETAIL.itemId}/tags`,
      );
    });
    expect(_opens()).toEqual([`GET /api/items/${DETAIL.itemId}`]);
  });

  it("asks once more, and says why, when a write is refused", async () => {
    respondWithItem(DETAIL, {
      [`PUT /api/items/${DETAIL.itemId}/tags`]: {
        body: { error: "item_edit_forbidden", message: "x" },
        status: 403,
      },
    });
    renderItem(DETAIL.itemId);

    await userEvent.click(
      await screen.findByRole("button", { name: "+ Add a tag" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Tags" }),
      "beach{enter}",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can no longer change this one.",
    );
    await waitFor(() => {
      expect(_opens()).toHaveLength(2);
    });
  });
});
