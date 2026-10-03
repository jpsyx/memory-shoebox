import type { Page } from "@playwright/test";
import { seedArchiveForSpec } from "../support/archive.ts";
import { expect, test } from "../support/signedIn.ts";

/**
 * The uploader's half of surface 3: tagging, who can see it, the capture
 * date and the delete, each through the real routes.
 *
 * 23 September holds one photograph (`archivePlan.ts`, "alone-1"), so `?at=`
 * puts it first on the page.
 */

test.beforeAll(async () => {
  await seedArchiveForSpec();
});

/** Opens the first photograph of one day. */
async function _openTheFirstPhotographOn(options: {
  page: Page;
  capturedOn: string;
}): Promise<void> {
  const { page, capturedOn } = options;
  await page.goto(`/?at=${capturedOn}`);
  await page.locator("[data-item-id]").first().click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
}

test("tags it, and the tag is a way into the pile", async ({ adminPage }) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });

  await adminPage.getByRole("button", { name: "+ Add a tag" }).click();
  const field = adminPage.getByRole("combobox", { name: "Tags" });
  await field.fill("garden party");
  await field.press("Enter");
  await adminPage.getByRole("button", { name: "Done" }).click();

  await expect(
    adminPage.getByRole("link", { name: "garden party" }),
  ).toBeVisible();
});

test("changes who can see it, and changes it back", async ({ adminPage }) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "Who can see this" });

  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  await adminPage.getByRole("option", { name: /abuela/iu }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(
    sheet.getByRole("button", { name: "Change who can see it" }),
  ).toBeVisible();
  await expect(sheet.getByText("Everyone", { exact: true })).toHaveCount(0);

  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Everyone", { exact: true }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Everyone", { exact: true })).toBeVisible();
});

test.fixme("offers the Shoebox's members and groups to choose from", async ({
  adminPage,
}) => {
  // `GET /api/members` and `GET /api/groups` are step 8a's. Turn this on when
  // it merges: `apps/web/src/api/members` and `api/groups` are already
  // written against `administration.md` (decision 8 of the step 6b design).
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "Who can see this" });
  await sheet.getByRole("button", { name: "Change who can see it" }).click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  await expect(
    adminPage.getByRole("option", { name: /prima/iu }),
  ).toBeVisible();
});

test("deletes it, and it is not there afterwards", async ({ adminPage }) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-10",
  });
  const itemUrl = adminPage.url();

  await adminPage
    .getByRole("button", { name: "Delete this photograph" })
    .click();
  await adminPage
    .getByRole("dialog", { name: "Delete this photograph?" })
    .getByRole("button", { name: "Delete it" })
    .click();
  await expect(adminPage).toHaveURL(/\/\?at=2026-09-10$/u);

  await adminPage.goto(itemUrl);
  await expect(
    adminPage.getByRole("heading", { level: 1, name: "This one is not here." }),
  ).toBeVisible();
});

test("puts the date right, and the photograph moves to its day", async ({
  adminPage,
}) => {
  await _openTheFirstPhotographOn({
    page: adminPage,
    capturedOn: "2026-09-23",
  });
  const sheet = adminPage.getByRole("region", { name: "When this was taken" });

  await sheet.getByRole("button", { name: "Put the date right" }).click();
  await sheet.getByLabel("The day it was taken").click();
  await adminPage.getByRole("button", { name: "22 September 2026" }).click();
  await sheet.getByRole("button", { name: "Put it right" }).click();

  await expect(sheet.getByText(/^22 September 2026, /u)).toBeVisible();
  await expect(
    adminPage.getByRole("link", { name: "Back to 22 September" }),
  ).toBeVisible();
});
