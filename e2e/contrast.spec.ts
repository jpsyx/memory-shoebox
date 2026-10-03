import type { Page } from "@playwright/test";
import { getContrastFailuresFromPage } from "./support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";
import { makeReportFromContrastFailures } from "./support/makeReportFromContrastFailures.ts";
import { expect, test } from "./support/signedIn.ts";
import { CODE_LABEL, OPEN_THE_PHOTOS } from "./support/signIn.ts";

/**
 * Both built surfaces, in both colour schemes, at both widths, against AA.
 *
 * **It asserts a property, not a picture.** There is no baseline here and
 * nothing to approve: the claim is that every word on these two surfaces can
 * be read, which stays true when the copy changes, when a sheet is reordered
 * and when a fifth section is added. A golden file would fail on all three and
 * would teach everybody to re-bless it without looking.
 *
 * **Reduced motion, so what is measured is a settled colour.** `.buttonRoot`
 * carries `transition: background 150ms`, so the submit button spends a tenth
 * of a second part way between the ink it had and the ink it is going to, and
 * a sweep that lands in that window reads a blend of the two: the refusal
 * state below failed at 2.86:1 on a button whose background was half way back
 * from disabled. `global.css` answers `prefers-reduced-motion: reduce` by
 * cutting every transition to nothing, so asking for it here is not a wait
 * dressed up as a setting, it is the same page with the tweening taken out.
 *
 * The two schemes are what make it worth running. The renditions follow
 * `prefers-color-scheme` (`docs/web.md` § Styling), and Day and Night swap
 * which of the four inks is the dark one, so a token used in the wrong context
 * can read perfectly in one and fail in the other. That is not hypothetical:
 * it is the defect this spec was written after, and
 * `support/getContrastFailuresFromPage/` records what it was.
 *
 * **No sign-in at all for the whole file.** Surface 9 needs a session and
 * surface 1 does not, and the four signed-in sweeps take the run's one shared
 * admin from `support/signedIn.ts` rather than minting a code of their own.
 * `signIn.spec.ts` explains why that matters: the whole suite shares one per-IP
 * bucket, and `support/signIn.ts` counts against it. Nothing here mints
 * anything.
 */

/** The name field on surface 9, which is also what says it has arrived. */
const NAME_LABEL = "Your name";

/** What the surface says when digits are spent against no live code. */
const EXPIRED_COPY =
  "That code has expired. They last ten minutes. Send another and use the newest email.";

/** The two widths the design spec names, as viewports. */
const WIDTHS = [
  { label: "1280px", size: { width: 1280, height: 900 } },
  { label: "400px", size: { width: 400, height: 860 } },
] as const;

/** Day and Night, chosen the only way the product lets anybody choose them. */
const SCHEMES = ["light", "dark"] as const;

/** The same two, by the names `DESIGN.md` gives them, for a test's title. */
const RENDITION_NAMES = { light: "Day", dark: "Night" } as const;

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

for (const scheme of SCHEMES) {
  for (const { label, size } of WIDTHS) {
    const rendition = RENDITION_NAMES[scheme];

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
        await expect(page.getByText(EXPIRED_COPY)).toBeVisible();
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
      await expect(adminPage.getByLabel(NAME_LABEL)).toBeVisible();
      await _expectTheViewToMeetAa({
        page: adminPage,
        where: `my account (${rendition}, ${label})`,
      });
    });
  }
}
