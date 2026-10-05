import { expect, type Page } from "@playwright/test";

/** Fill the approved fields without changing the browser's origin/timezone defaults. */
export async function fillSetup(
  page: Page,
  email = "rosa@example.com",
): Promise<void> {
  await page.getByLabel("Your name", { exact: true }).fill("Rosa");
  await page.getByLabel("Your email", { exact: true }).fill(email);
  await page
    .getByLabel("Shoebox name", { exact: true })
    .fill("Family photographs");
}

/** Create the first admin through the real browser and bootstrap contract. */
export async function createSetup(page: Page): Promise<void> {
  await page.goto("/");
  await fillSetup(page);
  await page
    .getByRole("button", { name: "Review your email", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create your Shoebox", exact: true })
    .click();
  await expect(page).toHaveURL(/\/setup\/invite$/);
}

/** Home must expose the existing upload route after actual completion. */
export async function expectUploadHome(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("link", { name: "Add", exact: true }),
  ).toBeVisible();
}
