import type { AdminVisualCapture } from "./visual.types.ts";
import { expect } from "../admin.fixtures.ts";
/** Opens the local settings draft or preview requested by the capture case. */
export async function prepareSettingsVisual({
  page,
  state,
}: Readonly<AdminVisualCapture>): Promise<void> {
  if (state === "renaming") {
    await page
      .getByLabel("Shoebox name", { exact: true })
      .fill("Our family memories");
  }
  if (state === "tidy") {
    await page
      .getByRole("radiogroup", { name: "Pile arrangement" })
      .getByText("Tidy", { exact: true })
      .click();
  }
  if (state === "timezone") {
    await page
      .getByLabel("This Shoebox's timezone", { exact: true })
      .selectOption("America/New_York");
    await page.getByRole("button", { name: "Preview timezone change" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm timezone change" }),
    ).toBeVisible();
    await expect(
      page.getByText("Changing this moves photographs between days."),
    ).toBeVisible();
  }
}
