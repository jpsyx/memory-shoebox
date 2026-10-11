import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openItemDetails } from "@/testing/openItemDetails";
import {
  ITEM_ID,
  makeItemDetail,
  makeBurstSummary,
  OWN_UPLOADER_CAPABILITIES,
} from "@/testing/itemFixtureHelpers";
import {
  getRecordedBodyFromRequest,
  getRecordedCountFromLine,
  renderItem,
  respondWithItem,
} from "@/testing/itemHarnessHelpers";
import { makeHold } from "@/testing/itemWriteTestHelpers";

const BURST_WRITE = `PATCH /api/items/${ITEM_ID}/burst`;

/** A photo that its owner previously separated from a burst. */
function _separatedPhoto(canManageBurst = true) {
  return makeItemDetail({
    canRestoreBurst: true,
    capabilities: { ...OWN_UPLOADER_CAPABILITIES, canManageBurst },
  });
}

describe("item burst controls", () => {
  it("restores a separated photo through its own write and updates the displayed item", async () => {
    respondWithItem({
      detail: _separatedPhoto(),
      routes: {
        [BURST_WRITE]: {
          body: makeItemDetail({
            burst: makeBurstSummary(),
            capabilities: {
              ...OWN_UPLOADER_CAPABILITIES,
              canManageBurst: true,
            },
          }),
          status: 200,
        },
      },
    });
    renderItem(ITEM_ID);
    await openItemDetails();
    await userEvent.click(
      await screen.findByRole("button", { name: "Return to burst" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /^(Make this photo standalone|Return to burst)\?$/,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Return to burst" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: /^(Make this photo standalone|Return to burst)\?$/,
        }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Make standalone" }),
      ).toBeVisible();
    });
    expect(getRecordedBodyFromRequest(BURST_WRITE)).toEqual({
      action: "restore",
    });
    expect(getRecordedCountFromLine(`GET /api/items/${ITEM_ID}`)).toBe(1);
  });

  it.each([false, undefined])(
    "hides restoration without explicit burst management permission (%s)",
    async (canManageBurst) => {
      respondWithItem({
        detail: makeItemDetail({
          ..._separatedPhoto(),
          capabilities: { ...OWN_UPLOADER_CAPABILITIES, canManageBurst },
        }),
      });
      renderItem(ITEM_ID);
      await openItemDetails();
      expect(
        screen.queryByRole("button", { name: "Return to burst" }),
      ).toBeNull();
    },
  );

  it("does not offer restoration for an ordinary standalone photo", async () => {
    respondWithItem({
      detail: makeItemDetail({
        capabilities: { ...OWN_UPLOADER_CAPABILITIES, canManageBurst: true },
      }),
    });
    renderItem(ITEM_ID);
    await openItemDetails();
    expect(
      screen.queryByRole("button", { name: "Return to burst" }),
    ).toBeNull();
  });

  it("keeps focus and prevents duplicate writes and dismissal while removal is pending", async () => {
    const { hold, letGo } = makeHold();
    respondWithItem({
      detail: makeItemDetail({
        burst: makeBurstSummary(),
        capabilities: { ...OWN_UPLOADER_CAPABILITIES, canManageBurst: true },
      }),
      routes: {
        [BURST_WRITE]: { body: _separatedPhoto(), status: 200, waitFor: hold },
      },
    });
    renderItem(ITEM_ID);
    await openItemDetails();
    await userEvent.click(
      await screen.findByRole("button", { name: "Make standalone" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /^(Make this photo standalone|Return to burst)\?$/,
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Make standalone",
    });
    confirm.focus();
    await userEvent.keyboard("{Enter}{Enter}{Escape}");
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(getRecordedCountFromLine(BURST_WRITE)).toBe(1);
    letGo();
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: /^(Make this photo standalone|Return to burst)\?$/,
        }),
      ).toBeNull();
    });
    expect(getRecordedBodyFromRequest(BURST_WRITE)).toEqual({
      action: "remove",
    });
    expect(
      screen.getByRole("button", { name: "Return to burst" }),
    ).toBeVisible();
  });

  it("shows a failed write and permits retry without pretending the photo moved", async () => {
    respondWithItem({
      detail: _separatedPhoto(),
      routes: {
        [BURST_WRITE]: {
          body: { error: "server_error", message: "Try again." },
          status: 500,
        },
      },
    });
    renderItem(ITEM_ID);
    await openItemDetails();
    await userEvent.click(
      await screen.findByRole("button", { name: "Return to burst" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /^(Make this photo standalone|Return to burst)\?$/,
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Return to burst" }),
    );
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    const retry = within(dialog).getByRole("button", {
      name: "Return to burst",
    });
    expect(retry).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(retry);
    await waitFor(() => {
      expect(getRecordedCountFromLine(BURST_WRITE)).toBe(2);
    });
  });
});
