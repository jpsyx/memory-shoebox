import type { Page } from "@playwright/test";
import { getContrastFailuresFromPage } from "./support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";
import { makeReportFromContrastFailures } from "./support/makeReportFromContrastFailures.ts";
import { expect, test } from "./support/signedIn/signedIn.ts";
import { CODE_LABEL, OPEN_THE_PHOTOS } from "./support/signInHelpers.ts";

/** The two widths the design spec names, as viewports. */
const WIDTHS = [
  { label: "1280px", size: { width: 1280, height: 900 } },
  { label: "400px", size: { width: 400, height: 860 } },
] as const;

/**
 * Sweeps whatever is on screen and fails with everything needed to fix it.
 *
 * @param options.page A page that has finished rendering the view.
 * @param options.where What to call that view in a failure.
 */
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

(["light", "dark"] as const).forEach((scheme) => {
  WIDTHS.forEach(({ label, size }) => {
    const rendition = ({ light: "Day", dark: "Night" } as const)[scheme];

    test(`surface 1 meets AA in ${rendition} at ${label}`, async ({
      browser,
    }) => {
      // Its own address, member of nothing. The refusal below needs an address
      // with no live code, and every test owning one keeps this file's
      // redemptions well inside the per-address cap however often it is run.
      const email = `contrast-${scheme}-${size.width}@example.com`;
      const context = await browser.newContext({ viewport: size });
      try {
        const page = await context.newPage();
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });

        // The three states that are a URL, which is most of surface 1: the
        // state lives in the search parameters precisely so that a reload
        // keeps it (`docs/web.md`). None of them mints a code.
        const states = [
          { where: "sign in, entering an address", url: "/sign-in" },
          {
            where: "sign in, from a link",
            url: "/sign-in?redirect=/items/abc",
          },
          {
            where: "sign in, code sent",
            url: `/sign-in?email=${email}&sent=true`,
          },
        ];
        for (const state of states) {
          await page.goto(state.url);
          await expect(page.getByRole("button", { name: /./ })).not.toHaveCount(
            0,
          );
          await _expectTheViewToMeetAa({
            page,
            where: `${state.where} (${rendition}, ${label})`,
          });
        }

        // And one refusal, for the error ink no other state paints: a bold
        // label, a thicker border and a stroked icon, none of which appear
        // above. Digits spent against an address with no live code are
        // answered `410 sign_in_code_expired`, so this costs a redemption and
        // no mint.
        await page.getByLabel(CODE_LABEL).fill("000000");
        await page.getByRole("button", { name: OPEN_THE_PHOTOS }).click();
        await expect(
          page.getByText(
            "That code has expired. They last ten minutes. Send another and use the newest email.",
          ),
        ).toBeVisible();
        await _expectTheViewToMeetAa({
          page,
          where: `sign in, refused (${rendition}, ${label})`,
        });
      } finally {
        await context.close();
      }
    });

    test(`surface 9 meets AA in ${rendition} at ${label}`, async ({
      adminPage,
    }) => {
      await adminPage.setViewportSize(size);
      await adminPage.emulateMedia({
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      await adminPage.goto("/account");
      // The name field is inside the suspense boundary, so it is on screen
      // only once `GET /api/me` has answered and every sheet has content.
      await expect(adminPage.getByLabel("Your name")).toBeVisible();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `my account (${rendition}, ${label})`,
      });
    });
  });
});
