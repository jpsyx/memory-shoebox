import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
  VIEWER_CAPABILITIES,
} from "@/testing/itemFixtures";
import {
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarness";

describe("the actions", () => {
  it("offers the original to everybody, through the route that signs it", async () => {
    respondWithItem(makeItemDetail());
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("link", { name: "Download the original" }),
    ).toHaveAttribute("href", `/api/items/${ITEM_ID}/original`);
  });

  it("offers somebody tagged in it the way to ask for it to come down", async () => {
    respondWithItem(
      makeItemDetail({
        capabilities: { ...VIEWER_CAPABILITIES, canRequestRemoval: true },
      }),
    );
    renderItem(ITEM_ID);

    expect(
      await screen.findByRole("link", { name: "Ask for this to come down" }),
    ).toHaveAttribute("href", `/items/${ITEM_ID}/removal`);
    expect(
      screen.getByText(
        /Asking tells Mamá, who put it up, and everyone who runs the archive\./,
      ),
    ).toBeVisible();
  });

  it("deletes after saying what goes with it, then goes back to its day", async () => {
    const comments = ["d101", "d102", "d103"].map((suffix) => {
      return makeComment({
        commentId: `018f0000-0000-7000-8000-00000000${suffix}`,
      });
    });
    respondWithItem(
      makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES, comments }),
      { [`DELETE /api/items/${ITEM_ID}`]: { body: undefined, status: 204 } },
    );
    const { router } = renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete this photograph" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete this photograph?",
    });
    // The dialog fades in, and is not visible for the frame before it does.
    await waitFor(() => {
      expect(
        within(dialog).getByText(/the 3 comments on it go with it/),
      ).toBeVisible();
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete it" }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(router.state.location.search).toEqual({ at: "2026-09-14" });
    expect(recordedRequests()).toContain(`DELETE /api/items/${ITEM_ID}`);
  });

  it("cannot be kept or dismissed once the delete is out", async () => {
    let letTheDeleteLand = () => {};
    respondWithItem(
      makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES }),
      {
        [`DELETE /api/items/${ITEM_ID}`]: {
          body: undefined,
          status: 204,
          waitFor: new Promise<void>((settle) => {
            letTheDeleteLand = settle;
          }),
        },
      },
    );
    const { router } = renderItem(ITEM_ID);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete this photograph" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete this photograph?",
    });
    // "Delete it", "Keep it", and the close button in the dialog's header.
    expect(within(dialog).getAllByRole("button")).toHaveLength(3);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete it" }),
    );

    expect(
      within(dialog).getByRole("button", { name: "Keep it" }),
    ).toBeDisabled();
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    // Longer than the dialog's fade, so one that had begun to close is gone.
    await new Promise((settle) => {
      setTimeout(settle, 500);
    });
    expect(
      screen.getByRole("dialog", { name: "Delete this photograph?" }),
    ).toBeVisible();

    letTheDeleteLand();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });
});
