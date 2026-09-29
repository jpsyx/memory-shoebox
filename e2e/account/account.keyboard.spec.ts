import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { seedMemberAtAddress } from "../support/database.ts";
import { E2E_BASE_URL } from "../support/e2eEnvironment.ts";
import {
  NAME_LABEL,
  NOTIFY_LABELS,
  openMyAccount,
  SAVE_YOUR_NAME,
  signInOnThisPage,
  writeAndWaitForTheAnswer,
} from "./account.fixtures.ts";

/**
 * Surface 9 driven by key and nothing else.
 *
 * `account.fixtures.ts` holds this suite's docstring, including why every test
 * owns its own address and how the sign-in codes are rationed. The exception
 * it names is the pair at the foot of this file.
 */

/** The row button and the confirmation button on the device you are reading on. */
const SIGN_OUT_HERE = "Sign out here";

/**
 * The most tab stops any control on this surface is behind, with room to
 * spare. It exists so a walk that never arrives fails with a sentence rather
 * than hanging until Playwright's own timeout.
 */
const MOST_TAB_STOPS = 60;

/**
 * Presses Tab until `target` has focus.
 *
 * A counted walk rather than a fixed number of presses, because these two
 * controls sit behind the whole of the You and Email sheets and, for the
 * devices table, behind the scroll region's own unconditional tab stop
 * (`DevicesTable` says why that stop is there). Writing the number down would
 * make every one of these tests fail the next time a field is added, for a
 * reason that has nothing to do with what they check. What they check is that
 * the control is reachable and operable by key, and that is what this asserts.
 */
async function _tabUntilFocused(page: Page, target: Locator): Promise<void> {
  for (let stop = 0; stop < MOST_TAB_STOPS; stop += 1) {
    const hasFocus = await target.evaluate((node) => {
      return node === document.activeElement;
    });
    if (hasFocus) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(
    target,
    `not reachable in ${MOST_TAB_STOPS} tab stops from the top of the page`,
  ).toBeFocused();
}

/**
 * The first Tab of a walk, pressed on the body.
 *
 * `signIn.spec.ts` explains it: a real browser window has focus, so Tab starts
 * from the top of the document, and a page Playwright has just opened has none
 * and the key goes nowhere. This is what a focused window gives for free, and
 * it is still a key rather than a click.
 */
async function _tabInFromTheTop(page: Page): Promise<void> {
  await page.locator("body").press("Tab");
}

test("the name can be corrected with the keyboard alone", async ({ page }) => {
  const email = "my-keyboard@example.com";
  await openMyAccount({ page, email });

  // `body.press` for the first key only, for the reason `signIn.spec.ts`
  // gives: a page Playwright has just opened has no focus, so a bare Tab
  // goes nowhere.
  await page.locator("body").press("Tab");
  await expect(
    page.getByRole("link", { name: "Back to the pile" }),
  ).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel(NAME_LABEL)).toBeFocused();
  await page.keyboard.type("Tio Marco");

  // The Save button is disabled until the field has changed, and a disabled
  // button is not a tab stop, so reaching it at all is part of what this
  // asserts.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: SAVE_YOUR_NAME }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved.")).toBeVisible();
});

/**
 * The two controls on this surface that are neither a field nor a link: a
 * switch, and the button that ends a session.
 *
 * Step 4b's Verification asks for keyboard-only sign in, name correction,
 * switch and device sign-out. The first two are covered above and in
 * `signIn.spec.ts`; these are the other two, and neither was covered at any
 * layer, because every test that touched them used `click` and nothing under
 * `surfaces/Account/` pressed a key.
 *
 * **One sign-in for both, captured the way `contrast.spec.ts` captures its
 * own.** The whole suite shares one per-IP bucket (`support/signIn.ts`), and
 * two tests each minting a code would spend two of what is left rather than
 * one.
 *
 * **They run in the order they are written, and that is load-bearing**,
 * because the second one ends the session the first one uses. One worker and
 * `fullyParallel: false` (`playwright.config.ts`) are what make that true, and
 * they are the same two settings the device list already depends on.
 */
test.describe("the keyboard, on the two controls that are neither", () => {
  const email = "my-keyboard-controls@example.com";

  /** The session both tests below share, as a storage state. */
  let signedInState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await seedMemberAtAddress({ email });
      await signInOnThisPage({ page, email });
      signedInState = await context.storageState();
    } finally {
      await context.close();
    }
  });

  test("a switch can be flipped with the keyboard alone", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: signedInState });
    try {
      const page = await context.newPage();
      await page.goto("/account");
      await expect(page.getByLabel(NAME_LABEL)).toBeVisible();

      const firstSwitch = page.getByLabel(NOTIFY_LABELS[0]);
      await expect(firstSwitch).toBeChecked();

      await _tabInFromTheTop(page);
      await _tabUntilFocused(page, firstSwitch);

      // Space, which is the key a checkbox answers to, and the only one: a
      // switch that moved on Enter instead would be a switch a keyboard user
      // could reach and not work.
      await writeAndWaitForTheAnswer({
        page,
        write: async () => {
          await page.keyboard.press("Space");
        },
      });
      await expect(firstSwitch).not.toBeChecked();

      // Reloaded, so what is asserted is what the server stored rather than
      // what the optimistic write put on screen.
      await page.reload();
      await expect(page.getByLabel(NOTIFY_LABELS[0])).not.toBeChecked();
    } finally {
      await context.close();
    }
  });

  test("a device can be signed out with the keyboard alone", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: signedInState });
    try {
      const page = await context.newPage();
      await page.goto("/account");
      await expect(page.getByLabel(NAME_LABEL)).toBeVisible();

      // This session is the only one this member has, so the single row in the
      // table is the device it is being read on, and its button says so.
      const rowButton = page
        .getByRole("table")
        .getByRole("button", { name: SIGN_OUT_HERE });
      await expect(rowButton).toBeVisible();

      await _tabInFromTheTop(page);
      await _tabUntilFocused(page, rowButton);
      await page.keyboard.press("Enter");

      // The confirmation takes focus as it opens, so the walk to its button
      // starts from wherever the dialogue put it rather than from the top.
      const confirmButton = page
        .getByRole("dialog")
        .getByRole("button", { name: SIGN_OUT_HERE });
      await expect(confirmButton).toBeVisible();
      await _tabUntilFocused(page, confirmButton);
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(`${E2E_BASE_URL}/sign-in`);

      // And the device is gone rather than merely navigated away from: the
      // guard turns this same browser away when it asks for the surface
      // again, which it could only do if the session row had really gone.
      await page.goto("/account");
      await expect(page).toHaveURL(
        `${E2E_BASE_URL}/sign-in?redirect=%2Faccount`,
      );
    } finally {
      await context.close();
    }
  });
});
