import { expect, test, type Page } from "@playwright/test";
import { seedMemberAtAddress } from "./support/database.ts";
import { E2E_BASE_URL } from "./support/e2eEnvironment.ts";
import { signInAs } from "./support/signIn.ts";

/**
 * Surface 9 against the real server: the name the family sees, the four
 * switches, the five admin doors, and the one promise that cannot be checked
 * anywhere but here, that signing a device out really does stop it working.
 *
 * **Every test owns its own address**, for the reason `signIn.spec.ts` gives:
 * one catalog and one worker mean the specs share a Shoebox, and an address
 * is the only thing a sign-in is keyed on. Here it buys a second thing as
 * well: a member's device list is its own, so a test that signs devices in
 * and out cannot be reading or revoking rows another test is relying on, and
 * the order they run in stays a detail.
 *
 * **Every test here signs in, and sign-in codes are rationed.** The whole
 * suite shares one per-IP bucket. No number is written down in this file on
 * purpose: `e2e/support/signIn.ts` counts the mints as they happen and
 * refuses the one that would go over, against the rule the server actually
 * applies. A count in a comment here would be wrong the moment somebody
 * added a test, and a wrong comment is worse than none.
 */

/** The name field on surface 9, and the button that commits it. */
const NAME_LABEL = "Your name";
const SAVE_YOUR_NAME = "Save your name";

/** The four switches, by the label each one carries on screen. */
const NOTIFY_LABELS = [
  "Somebody puts photographs up",
  "Somebody writes on something of yours",
  "Somebody writes on something you wrote on",
  "Somebody asks for a photograph to come down",
] as const;

/** The bulk row, which offers one button or the other and never both. */
const TURN_THEM_ALL_OFF = "Turn them all off";
const TURN_THEM_BACK_ON = "Turn them back on";

/**
 * The five doors only an admin can open, and where each one goes.
 *
 * Both halves are asserted: a door that is drawn and goes nowhere is the
 * failure this is really watching for, and the surface builds each one as an
 * anchor wearing a button's clothes, which is exactly the shape that can look
 * right and not navigate.
 */
const ADMIN_DOORS = [
  { name: "Shoebox settings", path: "/settings" },
  { name: "Members and groups", path: "/members" },
  { name: "Milestones", path: "/milestones" },
  { name: "Who has been looking", path: "/presence" },
  { name: "Removal requests", path: "/removal-requests" },
] as const;

/** Every device row's button, whichever of the two words it carries. */
const SIGN_OUT_ANY_DEVICE = /^Sign out/;

/** What marks the row you are reading the list on. */
const THIS_ONE = "· this one";

/** Signs an already-seeded address in on this page and lands it on the pile. */
async function _signInOnThisPage(options: {
  page: Page;
  email: string;
}): Promise<void> {
  await options.page.goto("/sign-in");
  await signInAs(options);
  await expect(options.page).toHaveURL(`${E2E_BASE_URL}/`);
}

/**
 * Seeds an admin at `email`, signs in, and opens My account.
 *
 * The wait is on the name field, which is inside the suspense boundary: it is
 * on screen only once `GET /api/me` has answered, so no test below has to
 * think about whether the surface has finished arriving.
 */
async function _openMyAccount(options: {
  page: Page;
  email: string;
}): Promise<void> {
  await seedMemberAtAddress({ email: options.email });
  await _signInOnThisPage(options);
  await options.page.goto("/account");
  await expect(options.page.getByLabel(NAME_LABEL)).toBeVisible();
}

/**
 * Does something that writes to `PATCH /api/me`, and returns once the server
 * has answered it.
 *
 * **Not a nicety.** A switch moves optimistically, the instant it is flipped,
 * so the control looks settled long before the write lands. Reloading on the
 * strength of that would be a race between the browser's navigation and the
 * request it is abandoning, and the test would fail on a slow machine and
 * pass on a fast one. Waiting on the response makes what is asserted after
 * the reload a statement about what the server stored.
 */
async function _writeAndWaitForTheAnswer(options: {
  page: Page;
  write: () => Promise<void>;
}): Promise<void> {
  const answered = options.page.waitForResponse((response) => {
    return (
      response.url().endsWith("/api/me") &&
      response.request().method() === "PATCH"
    );
  });
  await options.write();
  await answered;
}

test("a name typed here is the name the family sees", async ({ page }) => {
  const email = "my-name@example.com";
  await _openMyAccount({ page, email });

  // Empty, with the email's local part as the hint: the fallback shows as a
  // placeholder rather than as text the member appears to have typed.
  const nameField = page.getByLabel(NAME_LABEL);
  await expect(nameField).toHaveValue("");
  await expect(nameField).toHaveAttribute("placeholder", "my-name");

  await nameField.fill("Abuela Rosa");
  await page.getByRole("button", { name: SAVE_YOUR_NAME }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(NAME_LABEL)).toHaveValue("Abuela Rosa");

  // My account draws its own top bar, with a way back where the Shoebox name
  // would be, so the product bar is checked where it actually is: on the pile.
  await page.getByRole("link", { name: "Back to the pile" }).click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
  await expect(page.getByRole("link", { name: "Abuela Rosa" })).toBeVisible();
});

test("a switch stays where it was left, and all four can go at once", async ({
  page,
}) => {
  const email = "my-switches@example.com";
  await _openMyAccount({ page, email });

  const firstSwitch = page.getByLabel(NOTIFY_LABELS[0]);
  await expect(firstSwitch).toBeChecked();
  await _writeAndWaitForTheAnswer({
    page,
    write: async () => {
      // `click` rather than `uncheck`. `uncheck` reads the control's state
      // back the instant the click is done and fails if it has not moved
      // yet, and this one moves a tick late: the surface writes the switch
      // optimistically inside `onMutate`, which first awaits
      // `cancelQueries`. That is a microtask, invisible to a person and
      // fatal to an assertion with no retry in it. The `expect` below is the
      // same check with Playwright's own waiting behind it.
      await firstSwitch.click();
    },
  });
  await expect(firstSwitch).not.toBeChecked();

  await page.reload();
  await expect(page.getByLabel(NOTIFY_LABELS[0])).not.toBeChecked();
  // The other three are untouched: one flip sends all four, so a bug that
  // sent the wrong four would look identical until this is asserted.
  await expect(page.getByLabel(NOTIFY_LABELS[1])).toBeChecked();

  await _writeAndWaitForTheAnswer({
    page,
    write: async () => {
      await page.getByRole("button", { name: TURN_THEM_ALL_OFF }).click();
    },
  });

  await page.reload();
  for (const label of NOTIFY_LABELS) {
    await expect(page.getByLabel(label)).not.toBeChecked();
  }
  // With nothing left on, the one thing to offer is the way back.
  await expect(
    page.getByRole("button", { name: TURN_THEM_BACK_ON }),
  ).toBeVisible();
});

test("an admin is offered all five doors, and every one of them opens", async ({
  page,
}) => {
  const email = "my-doors@example.com";
  await _openMyAccount({ page, email });

  for (const door of ADMIN_DOORS) {
    await expect(page.getByRole("link", { name: door.name })).toBeVisible();
  }

  for (const door of ADMIN_DOORS) {
    await page.goto("/account");
    await page.getByRole("link", { name: door.name }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}${door.path}`);
  }
});

/**
 * The promise the Account banner makes, and the reason sessions are rows in
 * a table rather than tokens nobody can reach once they are handed out: sign
 * a device out and it stops working immediately, wherever it is.
 *
 * **Two contexts, which is two cookie jars and therefore two real sessions**
 * for one member. Two pages in one context would share a cookie and prove
 * nothing at all.
 *
 * **The far device is proven working before anything is revoked.** Without
 * that this would pass just as well against a browser that had never been
 * signed in, which is the easiest way there is to fake this test.
 *
 * Both rows carry the same device label, because one Chromium sends one
 * `User-Agent` from both contexts, so the far one cannot be picked out by
 * name. "· this one" is what the surface uses to tell them apart and what a
 * member reading the table would go by, so it is what this goes by too. The
 * button filter drops the header row, which has none.
 */
test("a device signed out in one browser stops working in the other", async ({
  browser,
}) => {
  const email = "my-devices@example.com";
  await seedMemberAtAddress({ email });
  const here = await browser.newContext();
  const there = await browser.newContext();
  try {
    const pageHere = await here.newPage();
    const pageThere = await there.newPage();
    await _signInOnThisPage({ page: pageHere, email });
    await _signInOnThisPage({ page: pageThere, email });

    await pageThere.goto("/account");
    await expect(pageThere).toHaveURL(`${E2E_BASE_URL}/account`);
    await expect(pageThere.getByLabel(NAME_LABEL)).toBeVisible();

    await pageHere.goto("/account");
    const farDevice = pageHere
      .getByRole("row")
      .filter({
        has: pageHere.getByRole("button", { name: SIGN_OUT_ANY_DEVICE }),
      })
      .filter({ hasNotText: THIS_ONE });
    await expect(farDevice).toHaveCount(1);
    await farDevice.getByRole("button").click();
    await pageHere
      .getByRole("dialog")
      .getByRole("button", { name: "Sign it out" })
      .click();
    // Two rows before, one after, and the one left is this one.
    await expect(
      pageHere.getByRole("button", { name: SIGN_OUT_ANY_DEVICE }),
    ).toHaveCount(1);

    await pageThere.reload();
    await expect(pageThere).toHaveURL(
      `${E2E_BASE_URL}/sign-in?redirect=%2Faccount`,
    );
  } finally {
    await here.close();
    await there.close();
  }
});

test("signing out the device you are on puts you back on the sign-in page", async ({
  page,
}) => {
  const email = "my-last-device@example.com";
  await _openMyAccount({ page, email });

  // Scoped to the table and to the dialog, because the row's button and the
  // confirmation's carry the same four words.
  await page
    .getByRole("table")
    .getByRole("button", { name: "Sign out here" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out here" })
    .click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/sign-in`);

  // And it is gone rather than merely navigated away from: the guard turns
  // the same browser away when it asks for the surface again.
  await page.goto("/account");
  await expect(page).toHaveURL(`${E2E_BASE_URL}/sign-in?redirect=%2Faccount`);
});

test("the name can be corrected with the keyboard alone", async ({ page }) => {
  const email = "my-keyboard@example.com";
  await _openMyAccount({ page, email });

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

test("my account fits a phone, and a desktop at 200% zoom", async ({
  page,
}) => {
  const email = "my-zoom@example.com";
  await _openMyAccount({ page, email });

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
