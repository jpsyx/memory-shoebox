import { test, expect } from "./admin.fixtures.ts";

test("a committed invitation retains identity and cannot be submitted twice", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/evidence/session/admin?to=/members");
  await page
    .getByRole("button", { name: "Invite somebody", exact: true })
    .click();
  await page.getByLabel("Their email", { exact: true }).fill("new@example.com");
  await page.getByLabel("What to call them").fill("New cousin");
  await page.getByRole("button", { name: "Send the invitation" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation queued" }),
  ).toBeVisible();
  await expect(page.getByLabel("Their email", { exact: true })).toHaveValue(
    "new@example.com",
  );
  await expect(page.getByLabel("What to call them")).toHaveValue("New cousin");
  await expect(
    page.getByRole("button", { name: "Send the invitation" }),
  ).toBeDisabled();
  expect(
    await catalog.database.selectFrom("invitations").selectAll().execute(),
  ).toHaveLength(2);
});

test("a saved invitation survives account refresh failure and retries only reads", async ({
  page,
  catalog,
}) => {
  await page.goto("/api/evidence/session/admin?to=/members");
  await page
    .getByRole("button", { name: "Invite somebody", exact: true })
    .click();
  await page
    .getByLabel("Their email", { exact: true })
    .fill("recovery@example.com");
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: { code: "unavailable", message: "Temporary outage" } },
    });
  });
  await page.getByRole("button", { name: "Send the invitation" }).click();
  await expect(
    page.getByText("Invitation queued", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh your account" }).first(),
  ).toBeVisible();
  expect(
    await catalog.database.selectFrom("invitations").selectAll().execute(),
  ).toHaveLength(2);
  await page.unroute("**/api/me");
  await page
    .getByRole("button", { name: "Refresh your account" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh your account" }),
  ).toHaveCount(0);
  expect(
    await catalog.database.selectFrom("invitations").selectAll().execute(),
  ).toHaveLength(2);
});

test("device facts and the current-device action fit a 400px account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("/api/evidence/session/admin?to=/account");
  const action = page.getByRole("button", {
    name: "Sign out here",
    exact: true,
  });
  await expect(action).toBeVisible();
  const bounds = await action.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(400);
  const table = page.getByRole("table", { name: "Where you are signed in" });
  expect(
    await table.evaluate((element) => {
      return element.scrollWidth <= element.clientWidth;
    }),
  ).toBe(true);
});

test("day summary is contained before the archive footer at the zoom reproduction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 470 });
  await page.goto("/api/evidence/session/admin?to=/");
  await expect(
    page.getByText("That is all of it.", { exact: false }),
  ).toBeVisible();
  await page.evaluate(() => {
    return window.scrollTo(0, document.body.scrollHeight);
  });
  const footer = await page
    .getByText("The beginning", { exact: true })
    .boundingBox();
  const summary = await page
    .getByText("The first week", { exact: true })
    .first()
    .boundingBox();
  expect(footer).not.toBeNull();
  expect(summary).not.toBeNull();
  expect(summary!.y + summary!.height).toBeLessThanOrEqual(footer!.y);
});

test("a day summary stops before the adjacent older day", async ({
  page,
  catalog,
}) => {
  await catalog.database
    .updateTable("items")
    .set({ captured_on: "2026-09-26", captured_at: "2026-09-26T12:00:00.000Z" })
    .where("id", "=", "00000000-0000-4000-8000-000000000010")
    .execute();
  await page.setViewportSize({ width: 864, height: 470 });
  await page.goto("/api/evidence/session/admin?to=/");
  const olderDay = page.getByText("26", { exact: true });
  await expect(olderDay).toBeVisible();
  await olderDay.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  const summary = await page
    .getByText("The first week", { exact: true })
    .first()
    .boundingBox();
  const older = await olderDay.boundingBox();
  expect(summary).not.toBeNull();
  expect(older).not.toBeNull();
  expect(summary!.y + summary!.height).toBeLessThanOrEqual(older!.y);
});
