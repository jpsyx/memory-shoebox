import { test, expect } from "./setup.fixtures.ts";
import { createSetup } from "./setupActionHelpers.ts";

test("a failed setup read offers retry before an empty catalog enters creation", async ({
  page,
  catalog,
}) => {
  await page.route("**/api/setup", (route) => {
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "unavailable", message: "Unavailable" }),
    });
  });
  await page.goto("/items/missing");
  await expect(
    page.getByRole("heading", { name: "Could not open this Shoebox." }),
  ).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/setup");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole("heading", { name: "Set up your Shoebox." }),
  ).toBeVisible();
  expect(catalog.assertions.members()).toEqual([]);
});

["not-an-email", "123", "true"].forEach((address) => {
  test(`join prefills ${address} without requesting a code or granting access`, async ({
    page,
    browser,
    catalog,
  }) => {
    await createSetup(page);
    await page.getByRole("button", { name: "Skip for now" }).click();
    const outsider = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const signIn = await outsider.newPage();
      await signIn.goto(`${catalog.origin}/join?address=${address}`);
      await expect(signIn).toHaveURL(/\/sign-in(?:\?|$)/);
      await expect(signIn.getByLabel("Your email")).toHaveValue(address);
      expect(
        catalog.assertions.emails().filter((email) => {
          return email.kind === "sign_in_code";
        }),
      ).toEqual([]);
      expect(catalog.assertions.members()).toHaveLength(1);
    } finally {
      await outsider.close();
    }
  });
});
