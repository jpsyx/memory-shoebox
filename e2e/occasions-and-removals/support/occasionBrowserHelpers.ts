import type { Locator, Page } from "@playwright/test";
import { expect } from "../asking-occasions.fixtures.ts";

/** Traverses real tab order, including reverse traversal, without forcing focus. */
export async function reachControlWithKeyboard(options: {
  page: Page;
  control: Locator;
  backwards?: boolean;
}): Promise<void> {
  for (let step = 0; step < 120; step += 1) {
    if (
      await options.control.evaluate((element) => {
        return element === document.activeElement;
      })
    )
      return;
    await options.page.keyboard.press(options.backwards ? "Shift+Tab" : "Tab");
  }
  await expect(options.control).toBeFocused();
}

/** Creates a real occasion through its form and returns its saved address. */
export async function makeOccasionFromBrowser(options: {
  page: Page;
  name: string;
  isSpan?: boolean;
}): Promise<string> {
  const { page, name, isSpan } = options;
  await page.goto("/milestones?mode=create");
  await page.getByLabel("What happened").fill(name);
  if (isSpan)
    await page
      .getByRole("switch", { name: "It ran over more than one day" })
      .check();
  await page.getByLabel(isSpan ? "When it ran" : "When it happened").click();
  await page
    .getByRole("button", { name: "17 October 2026", exact: true })
    .click();
  if (isSpan)
    await page
      .getByRole("button", { name: "21 October 2026", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Create it and find its photographs" })
    .click();
  await expect(page).toHaveURL(/mode=created/);
  const milestoneId = new URL(page.url()).searchParams.get("milestone");
  if (milestoneId === null)
    throw new Error("Created occasion has no saved address");
  return milestoneId;
}
