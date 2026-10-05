import {
  listMilestoneCandidatesResponseSchema,
  type ListMilestoneCandidatesResponse,
} from "@memory-shoebox/shared";
import type { APIResponse, Locator, Page } from "@playwright/test";
import { expect } from "../asking-occasions.fixtures.ts";
/**
 * Traverses real tab order, including reverse traversal, without forcing focus.
 */
export async function reachControlWithKeyboard(
  options: Readonly<{
    page: Page;
    control: Locator;
    backwards?: boolean;
  }>,
): Promise<void> {
  for (let step = 0; step < 120; step += 1) {
    if (
      await options.control.evaluate((element) => {
        return element === document.activeElement;
      })
    ) {
      return;
    }
    await options.page.keyboard.press(options.backwards ? "Shift+Tab" : "Tab");
  }
  await expect(options.control).toBeFocused();
}

/**
 * Creates the October fixture occasion through the real form. Only the
 * browser's
 * current date is fixed to its fixture month; timers and the API clock still
 * run.
 */
export async function makeOccasionFromBrowser(
  options: Readonly<{
    page: Page;
    name: string;
    isSpan?: boolean;
  }>,
): Promise<string> {
  const { page, name, isSpan } = options;
  await page.clock.setFixedTime(new Date("2026-10-01T12:00:00.000Z"));
  await page.goto("/milestones?mode=create");
  await page.getByLabel("What happened").fill(name);
  if (isSpan) {
    await page
      .getByRole("switch", { name: "It ran over more than one day" })
      .check();
  }
  await page.getByLabel(isSpan ? "When it ran" : "When it happened").click();
  await page
    .getByRole("button", { name: "17 October 2026", exact: true })
    .click();
  if (isSpan) {
    await page
      .getByRole("button", { name: "21 October 2026", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Create it and find its photographs" })
    .click();
  await expect(page).toHaveURL(/mode=created/);
  const milestoneId = new URL(page.url()).searchParams.get("milestone");
  if (milestoneId === null) {
    throw new Error("Created occasion has no saved address");
  }
  return milestoneId;
}

/** Reaches a control through real tab order and activates it with Enter. */
export async function activateControlWithKeyboard(
  options: Readonly<{ page: Page; control: Locator }>,
): Promise<void> {
  await reachControlWithKeyboard(options);
  await options.page.keyboard.press("Enter");
}
/** Seeds an empty October occasion for attachment keyboard scenarios. */
export async function seedOccasionThroughApi({
  page,
  name,
}: Readonly<{ page: Page; name: string }>): Promise<APIResponse> {
  return page.request.post("/api/milestones", {
    data: { name, startsOn: "2026-10-17", endsOn: "2026-10-17", blurb: null },
  });
}

/** Reads the authoritative candidate attachment flags for an occasion. */
export async function getMilestoneCandidatesFromPage({
  page,
  milestoneId,
}: Readonly<{
  page: Page;
  milestoneId: string;
}>): Promise<ListMilestoneCandidatesResponse> {
  const response = await page.request.get(
    `/api/milestones/${milestoneId}/candidates`,
  );
  return listMilestoneCandidatesResponseSchema.parse(await response.json());
}
