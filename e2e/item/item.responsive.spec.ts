import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import {
  openFirstPhotographOn,
  openSeededVideo,
} from "../support/itemHelpers.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Both surfaces at 200% zoom with no horizontal scroll (`PRODUCT.md`
 * § Accessibility & Inclusion). 200% of the 1280px design width is a 640px
 * viewport, which is how `pile.spec.ts` measures the same promise; 400px is
 * the phone.
 *
 * Only the sideways scroll is asserted here. That nothing is clipped is
 * checked by eye, in the verification step's side-by-side screenshots of
 * every state against its prototype (`step-6b.md` § Verification), because
 * no property of the DOM says it.
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

[640, 400].forEach((width) => {
  test(`draws a photograph at ${width}px with no sideways scroll`, async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ width, height: 800 });
    await openFirstPhotographOn({ page: adminPage, capturedOn: "2026-09-23" });
    await expect(
      adminPage.getByRole("region", { name: "Comments" }),
    ).toBeVisible();

    expect(await _overflowsSideways(adminPage)).toBe(false);
  });

  test(`draws a video at ${width}px with no sideways scroll`, async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ width, height: 800 });
    await openSeededVideo(adminPage);
    await expect(
      adminPage.getByRole("slider", { name: "Where in the video" }),
    ).toBeVisible();

    expect(await _overflowsSideways(adminPage)).toBe(false);
  });
});
