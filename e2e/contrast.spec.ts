import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  getContrastFailuresFromPage,
  makeReportFromContrastFailures,
} from "./support/contrast.ts";
import { seedMemberAtAddress } from "./support/database.ts";
import { E2E_BASE_URL } from "./support/e2eEnvironment.ts";
import { CODE_LABEL, OPEN_THE_PHOTOS, signInAs } from "./support/signIn.ts";

/**
 * Both built surfaces, in both colour schemes, at both widths, against AA.
 *
 * **It asserts a property, not a picture.** There is no baseline here and
 * nothing to approve: the claim is that every word on these two surfaces can
 * be read, which stays true when the copy changes, when a sheet is reordered
 * and when a fifth section is added. A golden file would fail on all three and
 * would teach everybody to re-bless it without looking.
 *
 * The two schemes are what make it worth running. The renditions follow
 * `prefers-color-scheme` (`docs/web.md` § Styling), and Day and Night swap
 * which of the four inks is the dark one, so a token used in the wrong context
 * can read perfectly in one and fail in the other. That is not hypothetical:
 * it is the defect this spec was written after, and `support/contrast.ts`
 * records what it was.
 *
 * **One sign-in for the whole file.** Surface 9 needs a session and surface 1
 * does not, and a session made once and handed to every context costs the run
 * one code instead of four. `signIn.spec.ts` explains why that matters: the
 * whole suite shares one per-IP bucket, and `support/signIn.ts` counts against
 * it. Nothing else here mints anything.
 */

/** The member every signed-in sweep in this file looks at the account of. */
const CONTRAST_MEMBER = "contrast@example.com";

/** The name field on surface 9, which is also what says it has arrived. */
const NAME_LABEL = "Your name";

/** What the surface says when digits are spent against no live code. */
const EXPIRED_COPY =
  "That code has expired. They last ten minutes. Send another and use the newest email.";

/**
 * The session the whole file shares, as a storage state.
 *
 * Captured from a real sign-in through surface 1 rather than by posting to the
 * API: `support/signIn.ts` is the only way this suite gets a session, for the
 * reason stated there.
 */
let signedInState: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await seedMemberAtAddress({ email: CONTRAST_MEMBER });
    await page.goto("/sign-in");
    await signInAs({ page, email: CONTRAST_MEMBER });
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
    signedInState = await context.storageState();
  } finally {
    await context.close();
  }
});

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
        await page.emulateMedia({ colorScheme: scheme });

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
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: size,
        storageState: signedInState,
      });
      try {
        const page = await context.newPage();
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto("/account");
        // The name field is inside the suspense boundary, so it is on screen
        // only once `GET /api/me` has answered and every sheet has content.
        await expect(page.getByLabel(NAME_LABEL)).toBeVisible();
        await _expectTheViewToMeetAa({
          page,
          where: `my account (${rendition}, ${label})`,
        });
      } finally {
        await context.close();
      }
    });
  }
}
