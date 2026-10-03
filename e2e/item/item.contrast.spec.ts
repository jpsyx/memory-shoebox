import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import {
  getContrastFailuresFromPage,
  makeReportFromContrastFailures,
} from "../support/contrast.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * Surfaces 3 and 4 against AA, in both colour schemes at both widths, with
 * every sheet the item's own uploader gets and two editors open.
 *
 * In `e2e/item/` rather than in `contrast.spec.ts`, because that file runs
 * before `empty.spec.ts` and this one needs the archive seeded
 * (`docs/e2e.md` § The archive). The method is the same: reduced motion so a
 * settled colour is measured, and a property asserted rather than a picture.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

const WIDTHS = [
  { label: "1280px", size: { width: 1280, height: 900 } },
  { label: "400px", size: { width: 400, height: 860 } },
] as const;

const SCHEMES = ["light", "dark"] as const;

const RENDITION_NAMES = { light: "Day", dark: "Night" } as const;

/** Sweeps whatever is on screen and fails with everything needed to fix it. */
async function _expectTheViewToMeetAa(options: {
  page: Page;
  where: string;
}): Promise<void> {
  const failures = await getContrastFailuresFromPage(options.page);
  expect(
    failures,
    failures.length === 0
      ? ""
      : makeReportFromContrastFailures({ where: options.where, failures }),
  ).toEqual([]);
}

for (const scheme of SCHEMES) {
  for (const { label, size } of WIDTHS) {
    const rendition = RENDITION_NAMES[scheme];

    test(`surfaces 3 and 4 meet AA in ${rendition} at ${label}`, async ({
      adminPage,
    }) => {
      await adminPage.setViewportSize(size);
      await adminPage.emulateMedia({
        colorScheme: scheme,
        reducedMotion: "reduce",
      });

      await adminPage.goto("/?at=2026-09-23");
      await adminPage.locator("[data-item-id]").first().click();
      await expect(
        adminPage.getByRole("region", { name: "Who can see this" }),
      ).toBeVisible();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `one photo, its uploader (${rendition}, ${label})`,
      });

      await adminPage
        .getByRole("button", { name: "Change who can see it" })
        .click();
      await adminPage
        .getByRole("button", { name: "Put the date right" })
        .click();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `one photo, two editors open (${rendition}, ${label})`,
      });

      await adminPage.goto("/?at=2026-07-04");
      await adminPage
        .locator("[data-item-id]")
        .filter({ hasText: "0:10" })
        .click();
      await expect(
        adminPage.getByRole("slider", { name: "Where in the video" }),
      ).toBeVisible();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `one video (${rendition}, ${label})`,
      });
    });
  }
}
