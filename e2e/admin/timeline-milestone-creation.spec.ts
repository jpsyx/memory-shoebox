import type { Page } from "@playwright/test";
import { test, expect } from "./admin.fixtures.ts";
import type { AcceptanceCatalog } from "./support/createAcceptanceCatalog.ts";

async function _openSelectedMilestones(page: Page): Promise<void> {
  await page.goto("/api/evidence/session/admin?to=/");
  await page
    .getByRole("button", { name: "Select photos", exact: true })
    .click();
  const photos = page.getByRole("button", {
    name: /^A family memory/,
  });
  await photos.nth(0).click();
  await photos.nth(1).click();
  await page
    .getByRole("button", { name: "Put under a milestone", exact: true })
    .click();
}

async function _checkAttachments(catalog: AcceptanceCatalog): Promise<void> {
  const milestone = await catalog.database
    .selectFrom("milestones")
    .selectAll()
    .where("name", "=", "A weekend together")
    .executeTakeFirstOrThrow();
  expect(milestone.starts_on).toBe("2026-09-27");
  expect(milestone.ends_on).toBe("2026-09-27");
  const attached = await catalog.database
    .selectFrom("item_milestones")
    .innerJoin("items", "items.id", "item_milestones.item_id")
    .select(["items.id", "items.captured_on"])
    .where("milestone_id", "=", milestone.id)
    .execute();
  expect(attached).toHaveLength(2);
  expect(
    attached.every((item) => {
      return item.captured_on === "2026-09-27";
    }),
  ).toBe(true);
}

async function _saveAfterRefresh(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create a new milestone" }).click();
  await expect(page.getByLabel("What happened")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("2 selected photos and videos will be included.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("What happened").fill("A weekend together");
  const saved = page.waitForResponse((response) => {
    return (
      response.url().endsWith("/api/milestones") &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Create and attach 2" }).click();
  expect((await saved).status()).toBe(201);
  await expect(page).toHaveURL(/mode=created/);
}

[320, 1440].forEach((width) => {
  test(`creates a milestone with selected photos after refresh at ${width}px`, async ({
    page,
    catalog,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) {
      await catalog.database.deleteFrom("milestones").execute();
    }
    await _openSelectedMilestones(page);
    await expect(
      page.getByRole("button", { name: "Create a new milestone" }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("button", { name: "Create a new milestone" })
        .evaluate((button) => {
          return (
            button.getBoundingClientRect().width <=
            button.parentElement!.getBoundingClientRect().width
          );
        }),
    ).toBe(true);
    expect(
      await page.evaluate(() => {
        return document.documentElement.scrollWidth <= innerWidth;
      }),
    ).toBe(true);
    await _saveAfterRefresh(page);
    await _checkAttachments(catalog);
  });
});
