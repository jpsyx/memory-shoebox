import { expect, test } from "@playwright/test";
import { openMyAccount } from "./account.fixtures.ts";

/**
 * Surface 9 at the two widths that break a layout.
 *
 * `account.fixtures.ts` holds this suite's docstring, including why every test
 * owns its own address and how the sign-in codes are rationed.
 */

test("my account fits a phone, and a desktop at 200% zoom", async ({
  page,
}) => {
  const email = "my-zoom@example.com";
  await openMyAccount({ page, email });

  // 400x800 is a phone. 640x450 is what a 1280x900 window becomes at 200%
  // zoom, which is the reflow case WCAG 1.4.10 is about.
  for (const viewport of [
    { width: 400, height: 800 },
    { width: 640, height: 450 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/account");

    // The device table is the widest thing on this surface and the only one
    // that could push the page sideways, so the measurement is worthless
    // until it is actually drawn.
    await expect(page.getByRole("table")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(
      overflow,
      `sideways scroll at ${viewport.width}px`,
    ).toBeLessThanOrEqual(0);
  }
});
