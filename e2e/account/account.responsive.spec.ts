import { expect, test } from "../support/signedIn.ts";
import { NAME_LABEL } from "./account.fixtures.ts";

/**
 * Surface 9 at the two widths that break a layout.
 *
 * `account.fixtures.ts` holds this suite's docstring, including why a test that
 * signs devices out owns its own address and how the sign-in codes are
 * rationed. This one neither writes nor revokes anything, so it takes the run's
 * shared admin from `support/signedIn.ts` and costs the budget nothing.
 */

test("my account fits a phone, and a desktop at 200% zoom", async ({
  adminPage,
}) => {
  // 400x800 is a phone. 640x450 is what a 1280x900 window becomes at 200%
  // zoom, which is the reflow case WCAG 1.4.10 is about.
  for (const viewport of [
    { width: 400, height: 800 },
    { width: 640, height: 450 },
  ]) {
    await adminPage.setViewportSize(viewport);
    await adminPage.goto("/account");
    await expect(adminPage.getByLabel(NAME_LABEL)).toBeVisible();

    // The device table is the widest thing on this surface and the only one
    // that could push the page sideways, so the measurement is worthless
    // until it is actually drawn.
    await expect(adminPage.getByRole("table")).toBeVisible();
    const overflow = await adminPage.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(
      overflow,
      `sideways scroll at ${viewport.width}px`,
    ).toBeLessThanOrEqual(0);
  }
});
