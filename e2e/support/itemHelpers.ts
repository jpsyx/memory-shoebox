import type { Page } from "@playwright/test";
import { expect } from "./signedIn.ts";

/**
 * The ways into surfaces 3 and 4 that the item specs share, each by way of
 * the pile, against the seeded archive (`apps/server/scripts/archiveSeed/
 * archivePlan.ts`).
 */

/** Opens 26 September, fans its burst, and opens the burst's first frame. */
export async function openFirstFrameOfBurst(page: Page): Promise<void> {
  await page.goto("/?at=2026-09-26");
  const stack = page.locator("[data-burst-id]").first();
  await stack.getByRole("button").first().click();
  // Until the frames arrive the cover is the stack's one print, and it
  // matches the frame below, so the fan has to be open first.
  await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
  await stack
    .getByRole("button", { name: /26 September 2026/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
}

/** Opens the first photograph of one day. */
export async function openFirstPhotographOn(
  options: Readonly<{ page: Page; capturedOn: string }>,
): Promise<void> {
  const { page, capturedOn } = options;
  await page.goto(`/?at=${capturedOn}`);
  await page.locator("[data-item-id]").first().click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
}

/** Opens the one seeded video, ten seconds long, on 4 July. */
export async function openSeededVideo(page: Page): Promise<void> {
  await page.goto("/?at=2026-07-04");
  await page.locator("[data-item-id]").filter({ hasText: "0:10" }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/u);
}
