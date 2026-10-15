import { expect, test } from "../admin.fixtures.ts";

test("the details drawer fits a phone and returns focus to More", async ({
  page,
  catalog,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  const more = page.getByRole("button", { name: "More video details" });
  await more.click();
  const drawer = page.getByRole("dialog", { name: "Video details" });
  await expect(
    drawer.getByRole("heading", { name: "In this one" }),
  ).toBeVisible();
  await drawer
    .getByRole("link", { name: "Download the original" })
    .scrollIntoViewIfNeeded();
  const bounds = await drawer.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(more).toBeFocused();
});

test("Escape closes a nested delete dialog before the details drawer", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await page.getByRole("button", { name: "More video details" }).click();
  const drawer = page.getByRole("dialog", { name: "Video details" });
  await drawer
    .getByRole("button", { name: "Delete this video", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete this video?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("Escape inside the calendar preserves the video details editor", async ({
  page,
  catalog,
}) => {
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await page.getByRole("button", { name: "More video details" }).click();
  const drawer = page.getByRole("dialog", { name: "Video details" });
  await drawer.getByRole("button", { name: "Put the date right" }).click();
  const day = drawer.getByRole("button", { name: "The day it was taken" });
  await day.click();
  const calendar = page.locator("[data-dates-dropdown]");
  await expect(calendar).toBeVisible();
  await calendar.getByRole("button").first().focus();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(day).toBeVisible();
});

test("Escape during a slow delete preserves its completion and navigation", async ({
  page,
  catalog,
}) => {
  await page.route(`**/api/items/${catalog.videoId}`, async (route) => {
    if (route.request().method() === "DELETE") {
      // A slow response must outlive the drawer's exit animation.
      await new Promise((resolve) => {
        setTimeout(resolve, 700);
      });
    }
    await route.continue();
  });
  await page.goto(`/api/evidence/session/admin?to=/items/${catalog.videoId}`);
  await page.getByRole("button", { name: "More video details" }).click();
  await page
    .getByRole("button", { name: "Delete this video", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete this video?",
    exact: true,
  });
  await confirmation
    .getByRole("button", { name: "Delete it", exact: true })
    .click();
  await expect(
    confirmation.getByRole("button", { name: "Deleting", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(new RegExp(`/items/${catalog.videoId}$`));
  await expect
    .poll(async () => {
      return catalog.database
        .selectFrom("items")
        .select("id")
        .where("id", "=", catalog.videoId)
        .executeTakeFirst();
    })
    .toBeUndefined();
});
