import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderItem } from "@/testing/itemHarnessHelpers";
import {
  FIRST,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "../../ItemViewer/ItemNavigation/__tests__/ItemNavigationTestHelpers";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["click", "{Enter}", " "])(
  "opens the shared full-screen viewer from the photo with %s and retains its media",
  async (activation) => {
    respondWithNavigationItems();
    const { container } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    const photoEntry = screen.getByRole("button", {
      name: "View photo in full screen",
    });
    const photo = container.querySelector<HTMLElement>(
      "[data-photo-surface=viewer]",
    );
    const composer = screen.getByRole("textbox", { name: "Write a comment" });
    if (activation === "click") {
      await userEvent.click(photoEntry);
    } else {
      photoEntry.focus();
      await userEvent.keyboard(activation);
    }
    const fullScreen = screen.getByRole("dialog", { name: "Full screen" });
    expect(fullScreen).toContainElement(photo);
    expect(composer).toBeInTheDocument();
    expect(
      within(fullScreen).queryByRole("button", {
        name: "View photo in full screen",
      }),
    ).toBeNull();
    await userEvent.click(
      within(fullScreen).getByRole("button", { name: "Back" }),
    );
    expect(container.querySelector("[data-photo-surface=viewer]")).toBe(photo);
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBe(
      composer,
    );
    expect(
      screen.getByRole("button", { name: "Enter full screen" }),
    ).toHaveFocus();
  },
);
