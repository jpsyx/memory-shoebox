import type { Page } from "@playwright/test";
import { expect } from "../../media.fixtures.ts";

/** Saves the owner-only visibility choice through the actual item editor. */
export async function restrictItemToUploader({
  page,
  itemId,
}: Readonly<{ page: Page; itemId: string }>): Promise<void> {
  await page.goto(`/items/${itemId}`);
  await page
    .getByRole("button", { name: "More photo details", exact: true })
    .click();
  const sheet = page.getByRole("region", { name: "Who can see this" });
  await sheet
    .getByRole("button", { name: "Change who can see it", exact: true })
    .click();
  await sheet.getByText("Only", { exact: true }).click();
  await sheet.getByLabel("Only these").click();
  await page
    .getByRole("option", { name: "Retirement owner Admin", exact: true })
    .click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    sheet.getByRole("button", { name: "Change who can see it", exact: true }),
  ).toBeVisible();
  await expect(sheet.getByText("Everyone", { exact: true })).toHaveCount(0);
}
