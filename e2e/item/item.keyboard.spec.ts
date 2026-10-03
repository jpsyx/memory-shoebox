import type { Locator, Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surfaces 3 and 4 with nothing but a keyboard (`step-6b.md`
 * § Verification): open an item, move through the siblings, react, comment,
 * pin a comment to a moment. Nothing may depend on hover, and the reactions
 * picker, portalled to the end of the page, is the worked example of why.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Presses a key until `locator` has focus, failing after `limit` presses. */
async function _pressUntilFocused(options: {
  page: Page;
  locator: Locator;
  key?: "Tab" | "Shift+Tab";
  limit?: number;
}): Promise<void> {
  const { page, locator, key = "Tab", limit = 250 } = options;
  for (let press = 0; press < limit; press += 1) {
    const isFocused = await locator
      .evaluate((element) => {
        return element === document.activeElement;
      })
      .catch(() => {
        return false;
      });
    if (isFocused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(`${limit} presses of ${key} never reached the control`);
}

test("opens a frame, moves along the burst, reacts and comments", async ({
  adminPage,
}) => {
  await adminPage.goto("/?at=2026-09-26");
  const stack = adminPage.locator("[data-burst-id]").first();
  await _pressUntilFocused({
    page: adminPage,
    locator: stack.getByRole("button").first(),
  });
  await adminPage.keyboard.press("Enter");
  // The fan opens once its frames arrive. Until then the cover is the only
  // print in the stack, it still has focus, and it matches the frame below.
  await expect(
    adminPage.getByRole("button", { name: "Collapse" }),
  ).toBeVisible();
  const firstFrame = stack
    .getByRole("button", { name: /26 September 2026/ })
    .first();
  await _pressUntilFocused({ page: adminPage, locator: firstFrame });
  await adminPage.keyboard.press("Enter");
  await expect(
    adminPage.getByText("Frame 1 of 45", { exact: true }),
  ).toBeVisible();

  const strip = adminPage.getByRole("navigation", { name: /^45 frames/ });
  await _pressUntilFocused({
    page: adminPage,
    locator: strip.getByRole("link", { name: "Frame 1 of 45" }),
  });
  await adminPage.keyboard.press("ArrowRight");
  await expect(
    strip.getByRole("link", { name: "Frame 2 of 45" }),
  ).toBeFocused();
  await adminPage.keyboard.press("Enter");
  await expect(
    adminPage.getByText("Frame 2 of 45", { exact: true }),
  ).toBeVisible();

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("button", { name: "React", exact: true }),
    key: "Shift+Tab",
  });
  await adminPage.keyboard.press("Enter");
  const picker = adminPage.getByRole("dialog");
  await expect(picker.getByRole("button", { name: "Like" })).toBeFocused();
  await adminPage.keyboard.press("Tab");
  await adminPage.keyboard.press("Enter");
  // The picker's own "Love" stays in the page for the length of its exit
  // transition, so the row is read once the picker has gone.
  await expect(picker).toHaveCount(0);
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();

  const field = adminPage.getByRole("textbox", { name: "Say something" });
  await _pressUntilFocused({ page: adminPage, locator: field });
  await adminPage.keyboard.type("Typed without a mouse.");
  await adminPage.keyboard.press("Tab");
  await expect(adminPage.getByRole("button", { name: "Send" })).toBeFocused();
  await adminPage.keyboard.press("Enter");
  await expect(adminPage.getByText("Typed without a mouse.")).toBeVisible();
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
      name: "Pin a comment to this moment",
    }),
  });
  await adminPage.keyboard.press("Enter");

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("textbox", { name: "Say something at 0:03" }),
  });
  await adminPage.keyboard.type("Watch his hand here.");
  await adminPage.keyboard.press("Tab");
  await adminPage.keyboard.press("Enter");

  await expect(
    adminPage.getByRole("button", { name: /comment at 0:03$/u }),
  ).toBeVisible();
});
