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

/**
 * Fans 26 September's burst, opens its first frame, and moves along the strip
 * to the second, all by keyboard. The second, because the photo suite counts
 * what is said and left on the first.
 */
async function _openSecondFrameByKeyboard(page: Page): Promise<void> {
  await page.goto("/?at=2026-09-26");
  const stack = page.locator("[data-burst-id]").first();
  await _pressUntilFocused({
    page,
    locator: stack.getByRole("button").first(),
  });
  await page.keyboard.press("Enter");
  // The fan opens once its frames arrive. Until then the cover is the only
  // print in the stack, it still has focus, and it matches the frame below.
  await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
  const firstFrame = stack
    .getByRole("button", { name: /26 September 2026/ })
    .first();
  await _pressUntilFocused({ page, locator: firstFrame });
  await page.keyboard.press("Enter");
  await expect(page.getByText("Frame 1 of 45", { exact: true })).toBeVisible();

  const strip = page.getByRole("navigation", { name: /^45 frames/ });
  await _pressUntilFocused({
    page,
    locator: strip.getByRole("link", { name: "Frame 1 of 45" }),
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Frame 2 of 45", { exact: true })).toBeVisible();
}

test("moves along a burst with the arrow keys, keeping the strip's focus", async ({
  adminPage,
}) => {
  await _openSecondFrameByKeyboard(adminPage);

  await expect(
    adminPage
      .getByRole("navigation", { name: /^45 frames/ })
      .getByRole("link", { name: "Frame 2 of 45" }),
  ).toBeFocused();
});

test("keeps Shift+Tab inside the portalled reactions picker", async ({
  adminPage,
}) => {
  await _openSecondFrameByKeyboard(adminPage);

  await _pressUntilFocused({
    page: adminPage,
    locator: adminPage.getByRole("button", { name: "React", exact: true }),
    key: "Shift+Tab",
  });
  await adminPage.keyboard.press("Enter");
  const picker = adminPage.getByRole("dialog");
  const like = picker.getByRole("button", { name: "Like" });
  await expect(like).toBeFocused();
  // Trapped, not just moved in: back from the first choice wraps inside the
  // picker rather than escaping to the page it was portalled out of.
  await adminPage.keyboard.press("Shift+Tab");
  await expect
    .poll(() => {
      return picker.evaluate((dialog) => {
        return dialog.contains(document.activeElement);
      });
    })
    .toBe(true);
  await adminPage.keyboard.press("Tab");
  await expect(like).toBeFocused();
  await adminPage.keyboard.press("Tab");
  await adminPage.keyboard.press("Enter");
  // The picker's own "Love" stays in the page for the length of its exit
  // transition, so the row is read once the picker has gone.
  await expect(picker).toHaveCount(0);
  await expect(
    adminPage.getByRole("button", { name: "Love", exact: true }),
  ).toBeVisible();
});

test("hands focus back to the comment field once a keyboard-sent comment lands", async ({
  adminPage,
}) => {
  await _openSecondFrameByKeyboard(adminPage);

  const field = adminPage.getByRole("textbox", { name: "Say something" });
  await _pressUntilFocused({ page: adminPage, locator: field });
  await adminPage.keyboard.type("Typed without a mouse.");
  await adminPage.keyboard.press("Tab");
  await expect(adminPage.getByRole("button", { name: "Send" })).toBeFocused();
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
