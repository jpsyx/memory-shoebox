import { openItemDetails } from "@/testing/openItemDetails";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  OWN_UPLOADER_CAPABILITIES,
  SIGNED_IN,
  VIEWER_CAPABILITIES,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedCountFromLine,
  recordedRequests,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";

/** Presses delete and waits for the dialog that asks. */
async function _openDeleteDialog(): Promise<HTMLElement> {
  await userEvent.click(
    await screen.findByRole("button", { name: "Delete this photograph" }),
  );
  return screen.findByRole("dialog", { name: "Delete this photograph?" });
}

/** The item, with its delete answered only once the returned call is made. */
function _respondWithHeldDelete(): () => void {
  let letTheDeleteLand = () => {};
  respondWithItem({
    detail: makeItemDetail({ capabilities: OWN_UPLOADER_CAPABILITIES }),
    routes: {
      [`DELETE /api/items/${ITEM_ID}`]: {
        body: undefined,
        status: 204,
        waitFor: new Promise<void>((settle) => {
          letTheDeleteLand = settle;
        }),
      },
    },
  });
  return () => {
    letTheDeleteLand();
  };
}

describe("the actions", () => {
  it("offers the original to everybody, through the route that signs it", async () => {
    respondWithItem({ detail: makeItemDetail() });
    renderItem(ITEM_ID);
    await openItemDetails();

    expect(
      await screen.findByRole("link", { name: "Download the original" }),
    ).toHaveAttribute("href", `/api/items/${ITEM_ID}/original`);
  });

  it.each([false, true])(
    "offers somebody else's tagged photo for removal when canDelete is %s",
    async (canDelete) => {
      respondWithItem({
        detail: makeItemDetail({
          capabilities: {
            ...VIEWER_CAPABILITIES,
            canRequestRemoval: true,
            canDelete,
          },
        }),
      });
      renderItem(ITEM_ID);
      await openItemDetails();

      expect(
        await screen.findByRole("link", { name: "Ask for this to come down" }),
      ).toHaveAttribute("href", `/items/${ITEM_ID}/removal`);
      expect(
        screen.getByText(
          /Asking tells Mamá, who put it up, and everyone who runs the archive\./,
        ),
      ).toBeVisible();
    },
  );

  it.each(["viewer", "uploader", "admin"] as const)(
    "hides the removal ask from the photo's tagged owner with role %s",
    async (role) => {
      respondWithItem({
        detail: makeItemDetail({
          uploadedBy: SIGNED_IN,
          capabilities: {
            ...OWN_UPLOADER_CAPABILITIES,
            canDelete: role !== "viewer",
            canRequestRemoval: true,
          },
        }),
        routes: {
          "GET /api/me": { body: createMeResponse({ role }), status: 200 },
        },
      });
      renderItem(ITEM_ID);
      await openItemDetails();

      expect(
        screen.queryByRole("link", { name: "Ask for this to come down" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Asking tells/)).not.toBeInTheDocument();
      if (role !== "viewer") {
        expect(
          screen.getByRole("button", { name: "Delete this photograph" }),
        ).toBeVisible();
      }
    },
  );

  it("deletes after saying what goes with it, then goes back to its day", async () => {
    const comments = ["d101", "d102", "d103"].map((suffix) => {
      return makeComment({
        commentId: `018f0000-0000-7000-8000-00000000${suffix}`,
      });
    });
    respondWithItem({
      detail: makeItemDetail({
        capabilities: OWN_UPLOADER_CAPABILITIES,
        comments,
      }),
      routes: {
        [`DELETE /api/items/${ITEM_ID}`]: { body: undefined, status: 204 },
      },
    });
    const { router } = renderItem(ITEM_ID);
    await openItemDetails();

    const dialog = await _openDeleteDialog();
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
    const letTheDeleteLand = _respondWithHeldDelete();
    const { router } = renderItem(ITEM_ID);
    await openItemDetails();

    const dialog = await _openDeleteDialog();
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeInTheDocument();
    const deleteIt = within(dialog).getByRole("button", { name: "Delete it" });
    deleteIt.focus();
    await userEvent.keyboard("{Enter}");

    expect(deleteIt).toHaveTextContent("Deleting");
    expect(deleteIt).toHaveFocus();
    expect(deleteIt).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    expect(getRecordedCountFromLine(`DELETE /api/items/${ITEM_ID}`)).toBe(1);
    const keepIt = within(dialog).getByRole("button", { name: "Keep it" });
    expect(keepIt).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    await userEvent.click(keepIt);
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
