import { expect, test } from "@playwright/test";
import { seedMemberAtAddress } from "../support/database.ts";
import { E2E_BASE_URL } from "../support/e2eEnvironment.constants.ts";
import {
  ADMIN_DOORS,
  NAME_LABEL,
  NOTIFY_LABELS,
  openMyAccount,
  SAVE_YOUR_NAME,
  SIGN_OUT_ANY_DEVICE,
  signInOnThisPage,
  THIS_ONE,
  TURN_THEM_ALL_OFF,
  TURN_THEM_BACK_ON,
  writeAndWaitForTheAnswer,
} from "./account.fixtures.ts";

/**
 * What surface 9 is for: the name, the switches, the doors, and the devices.
 *
 * `account.fixtures.ts` holds this suite's docstring, including why every test
 * owns its own address and how the sign-in codes are rationed.
 */

test("a name typed here is the name the family sees", async ({ page }) => {
  const email = "my-name@example.com";
  await openMyAccount({ page, email });

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
  await openMyAccount({ page, email });

  const firstSwitch = page.getByLabel(NOTIFY_LABELS[0]);
  await expect(firstSwitch).toBeChecked();
  await writeAndWaitForTheAnswer({
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

  await writeAndWaitForTheAnswer({
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
  await openMyAccount({ page, email });

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
    await signInOnThisPage({ page: pageHere, email });
    await signInOnThisPage({ page: pageThere, email });

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
  await openMyAccount({ page, email });

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
