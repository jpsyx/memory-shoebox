import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Both surfaces at 200% zoom with no horizontal scroll and nothing clipped
 * (`PRODUCT.md` § Accessibility & Inclusion). 200% of the 1280px design width
 * is a 640px viewport, which is how `pile.spec.ts` measures the same promise;
 * 400px is the phone.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Whether the page scrolls sideways. */
function _overflowsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return (
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
    );
  });
}

for (const width of [640, 400]) {
  test(`draws a photograph at ${width}px with no sideways scroll`, async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ width, height: 800 });
    await adminPage.goto("/?at=2026-09-23");
    await adminPage.locator("[data-item-id]").first().click();
    await expect(
      adminPage.getByRole("region", { name: "Comments" }),
    ).toBeVisible();

    expect(await _overflowsSideways(adminPage)).toBe(false);
  });

  test(`draws a video at ${width}px with no sideways scroll`, async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ width, height: 800 });
    await adminPage.goto("/?at=2026-07-04");
    await adminPage
      .locator("[data-item-id]")
      .filter({ hasText: "0:10" })
      .click();
    await expect(
      adminPage.getByRole("slider", { name: "Where in the video" }),
    ).toBeVisible();

    expect(await _overflowsSideways(adminPage)).toBe(false);
  });
}
