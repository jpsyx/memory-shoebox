import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { getContrastFailuresFromPage } from "../support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";
import { makeReportFromContrastFailures } from "../support/makeReportFromContrastFailures.ts";
import {
  openFirstPhotographOn,
  openSeededVideo,
} from "../support/itemHelpers.ts";
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

const RENDITION_NAMES = { light: "Day", dark: "Night" } as const;

/**
 * Sweeps whatever is on screen and fails with everything needed to fix it.
 *
 * The pointer goes to a corner first. A press leaves it wherever the control
 * was, and whatever is drawn there next may or may not be painted hovered
 * depending on when Chromium looks again, which `signIn.spec.ts` found the
 * hard way; a sweep should measure the page, not where a click happened.
 */
async function _expectTheViewToMeetAa(options: {
  page: Page;
  where: string;
}): Promise<void> {
  await options.page.mouse.move(0, 0);
  const failures = await getContrastFailuresFromPage(options.page);
  expect(
    failures,
    failures.length === 0
      ? ""
      : makeReportFromContrastFailures({ where: options.where, failures }),
  ).toEqual([]);
}

/** Opens the visibility and capture-date editors, and waits for both. */
async function _openBothEditors(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Change who can see it" }).click();
  await page.getByRole("button", { name: "Put the date right" }).click();
  // Both editors, really open: a sweep of the closed sheets would pass and
  // say nothing about the fields.
  await expect(
    page.getByRole("radiogroup", { name: "Who can see this photograph" }),
  ).toBeVisible();
  await expect(page.getByLabel("The day it was taken")).toBeVisible();
}

/**
 * Sweeps the three views of surfaces 3 and 4: a photograph with every sheet
 * its uploader gets, the same with two editors open, and the video.
 *
 * @param options.condition The scheme and width, in the words a failure says.
 */
async function _sweepItemSurfaces(
  options: Readonly<{ page: Page; condition: string }>,
): Promise<void> {
  const { page, condition } = options;
  await openFirstPhotographOn({ page, capturedOn: "2026-09-23" });
  await expect(
    page.getByRole("region", { name: "Who can see this" }),
  ).toBeVisible();
  await _expectTheViewToMeetAa({
    page,
    where: `one photo, its uploader (${condition})`,
  });

  await _openBothEditors(page);
  await _expectTheViewToMeetAa({
    page,
    where: `one photo, two editors open (${condition})`,
  });

  await openSeededVideo(page);
  await expect(
    page.getByRole("slider", { name: "Where in the video" }),
  ).toBeVisible();
  await _expectTheViewToMeetAa({ page, where: `one video (${condition})` });
}

(["light", "dark"] as const).forEach((scheme) => {
  (
    [
      { label: "1280px", size: { width: 1280, height: 900 } },
      { label: "400px", size: { width: 400, height: 860 } },
    ] as const
  ).forEach(({ label, size }) => {
    const rendition = RENDITION_NAMES[scheme];

    test(`surfaces 3 and 4 meet AA in ${rendition} at ${label}`, async ({
      adminPage,
    }) => {
      await adminPage.setViewportSize(size);
      await adminPage.emulateMedia({
        colorScheme: scheme,
        reducedMotion: "reduce",
      });

      await _sweepItemSurfaces({
        page: adminPage,
        condition: `${rendition}, ${label}`,
      });
    });
  });
});
