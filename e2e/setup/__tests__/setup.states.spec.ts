import { test, expect } from "./setup.fixtures.ts";
import { fillSetup } from "./setupActionHelpers.ts";
import { getContrastFailuresFromPage } from "../../support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";

test("Night review and failed health controls retain readable text on the setup sheet", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/setup");
  await fillSetup({ page: page });
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Go back and edit" }),
  ).toBeVisible();
  const reviewFailures = await getContrastFailuresFromPage(page);
  await page.route("**/api/mail/health", (route) => {
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "temporary_failure", message: "Please retry" },
      }),
    });
  });
  await page.getByRole("button", { name: "Create your Shoebox" }).click();
  await expect(
    page.getByRole("button", { name: "Check email again" }),
  ).toBeVisible();
  expect({
    reviewFailures,
    healthFailures: await getContrastFailuresFromPage(page),
  }).toEqual({ reviewFailures: [], healthFailures: [] });
});

test("all intended rows validate before writes and skip survives a failed invitation", async ({
  page,
  catalog,
}) => {
  await page.goto("/setup");
  await fillSetup({ page: page });
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await page.getByRole("button", { name: "Create your Shoebox" }).click();
  await page.getByLabel("Email 1", { exact: true }).fill("valid@example.com");
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(page.getByLabel("Email 2", { exact: true })).toBeFocused();
  expect(catalog.assertions.invitations()).toEqual([]);
  await page.getByLabel("Email 2", { exact: true }).fill("failed@example.com");
  await page.route("**/api/members", async (route) => {
    if (route.request().method() === "POST") {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(page.getByRole("alert")).toHaveCount(2);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(catalog.assertions.pendingMemberId()).toBeUndefined();
});

test("completion failure keeps durable progress and retry clears it", async ({
  page,
  catalog,
}) => {
  await page.goto("/setup");
  await fillSetup({ page: page });
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await page.getByRole("button", { name: "Create your Shoebox" }).click();
  const pendingMemberId = catalog.assertions.pendingMemberId();
  expect(pendingMemberId).toEqual(catalog.assertions.members()[0]?.id);
  expect(pendingMemberId).toEqual(expect.any(String));
  await page.route("**/api/setup/complete", (route) => {
    return route.abort("failed");
  });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not finish setup. Try again or skip for now.",
  );
  expect(catalog.assertions.pendingMemberId()).toBe(pendingMemberId);
  await page.unroute("**/api/setup/complete");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(catalog.assertions.pendingMemberId()).toBeUndefined();
});
