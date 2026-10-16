import type { Locator, Page } from "@playwright/test";
import { seedArchiveForSpec } from "../../support/archiveSeedHelpers.ts";
import { getFirstFrameFromBurstOpening } from "../../support/itemHelpers.ts";
import { expect, test } from "../../support/signedIn/signedIn.ts";

/**
 * Photo and video surfaces with nothing but a keyboard: open an item,
 * move through the siblings, react, comment,
 * pin a comment to a moment. Nothing may depend on hover, and the reactions
 * picker, portalled to the end of the page, is the worked example of why.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** What `_pressUntilFocused` presses, and for how long. */
type PressUntilFocusedOptions = {
  page: Page;
  locator: Locator;
  key?: "Tab" | "Shift+Tab";
  limit?: number;
};

/** Presses a key until `locator` has focus, failing after `limit` presses. */
async function _pressUntilFocused(
  options: Readonly<PressUntilFocusedOptions>,
): Promise<void> {
  const { page, locator, key = "Tab", limit = 250 } = options;
  await expect(locator).toHaveCount(1);
  for (let press = 0; press < limit; press += 1) {
    const isFocused = await locator.evaluateAll((elements) => {
      return elements.length === 1 && elements[0] === document.activeElement;
    });
    if (isFocused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(`${limit} presses of ${key} never reached the control`);
}

/**
 * Fans 26 September's burst, opens its first frame, and moves along the strip
 * to the second, all by keyboard. The second, because the photo suite counts
 * what is said and left on the first.
 */
async function _openSecondFrameByKeyboard(page: Page): Promise<void> {
  await page.goto("/?at=2026-09-26");
  const { frame, itemId } = await getFirstFrameFromBurstOpening({
    page,
    activate: async (cover) => {
      await _pressUntilFocused({ page, locator: cover });
      await expect(cover).toBeFocused();
      await page.keyboard.press("Enter");
    },
  });
  await _pressUntilFocused({ page, locator: frame });
  await expect(frame).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`, "u"));
  await expect(page.getByText("Photo 1 of 45", { exact: true })).toBeVisible();

  const strip = page.getByRole("navigation", { name: /^45 photos/ });
  await _pressUntilFocused({
    page,
    locator: strip.getByRole("link", { name: "Photo 1 of 45" }),
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Photo 2 of 45", { exact: true })).toBeVisible();
}

test("moves along a burst with the arrow keys, keeping the strip's focus", async ({
  adminPage,
}) => {
  await _openSecondFrameByKeyboard(adminPage);

  await expect(
    adminPage
      .getByRole("navigation", { name: /^45 photos/ })
      .getByRole("link", { name: "Photo 2 of 45" }),
  ).toBeFocused();
});

test("reaches inline photo reactions with Shift+Tab and keeps focus after choosing", async ({
  adminPage,
}) => {
  await _openSecondFrameByKeyboard(adminPage);
  const love = adminPage.getByRole("button", {
    name: "React: Love",
    exact: true,
  });
  await _pressUntilFocused({
    page: adminPage,
    locator: love,
    key: "Shift+Tab",
  });
  await expect(love).toBeFocused();
  await adminPage.keyboard.press("Enter");
  await expect(love).toHaveAttribute("aria-pressed", "true");
  await expect(love).toBeFocused();
  await adminPage.keyboard.press("Tab");
  await expect(
    adminPage.getByRole("button", { name: "React: Like", exact: true }),
  ).toBeFocused();
  await adminPage.keyboard.press("Shift+Tab");
  await expect(love).toBeFocused();
});

test("hands focus back to the comment field once a keyboard-sent comment lands", async ({
  adminPage,
}) => {
  await _openSecondFrameByKeyboard(adminPage);

  const field = adminPage.getByRole("textbox", { name: "Write a comment" });
  await _pressUntilFocused({ page: adminPage, locator: field });
  await adminPage.keyboard.type("Typed without a mouse.");
  await adminPage.keyboard.press("Tab");
  await expect(
    adminPage.getByRole("button", { name: "Post comment" }),
  ).toBeFocused();
  await adminPage.keyboard.press("Enter");
  await expect(adminPage.getByText("Typed without a mouse.")).toBeVisible();
  // Send kept focus while it sent, and hands it to the field once the comment
  // has landed: the next thing is more words, not the top of the page.
  await expect(field).toBeFocused();
});

test("pins a comment to a moment of a video", async ({ adminPage }) => {
  await adminPage.goto("/?at=2026-07-04");
  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.locator("[data-item-id]").filter({ hasText: "0:10" }),
  });
  await adminPage.keyboard.press("Enter");

  const slider = adminPage.getByRole("slider", { name: "Where in the video" });
  await _pressUntilFocused({ page: adminPage, locator: slider });
  for (let step = 0; step < 3; step += 1) {
    await adminPage.keyboard.press("ArrowRight");
  }
  await expect(slider).toHaveAttribute("aria-valuetext", "0:03 of 0:10");

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("button", {
      name: "Comment on this moment",
    }),
  });
  await adminPage.keyboard.press("Enter");

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("textbox", { name: "Write a comment" }),
  });
  await expect(
    adminPage.getByRole("button", {
      name: "Comment at 0:03; switch to whole video",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await adminPage.keyboard.type("Watch his hand here.");
  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("button", {
      name: "Post comment",
      exact: true,
    }),
  });
  await adminPage.keyboard.press("Enter");

  await expect(
    adminPage
      .getByRole("article")
      .filter({ hasText: "Watch his hand here." })
      .getByRole("button", { name: "0:03 Go to this moment", exact: true }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("button", { name: /^Seek to 0:03:/u }),
  ).toBeVisible();
});
