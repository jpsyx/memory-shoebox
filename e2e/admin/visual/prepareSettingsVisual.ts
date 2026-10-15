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
      .getByRole("radiogroup", { name: "Timeline arrangement" })
      .getByText("Tidy", { exact: true })
      .click();
  }
  if (state === "timezone") {
    const timezone = page.getByRole("combobox", {
      name: "This Shoebox's timezone",
      exact: true,
    });
    await timezone.fill("America/New_York");
    await timezone.scrollIntoViewIfNeeded();
    await expect(timezone).toBeInViewport();
    await page
      .getByRole("option", { name: "America/New_York", exact: true })
      .click();
    await page.getByRole("button", { name: "Preview timezone change" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm timezone change" }),
    ).toBeVisible();
    await expect(
      page.getByText("Changing this moves photographs between days."),
    ).toBeVisible();
  }
}
