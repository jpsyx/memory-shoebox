import { burstFramesResponseSchema } from "@memory-shoebox/shared";
import type { Locator, Page } from "@playwright/test";
import { expect } from "./signedIn/signedIn.ts";

/**
 * The ways into surfaces 3 and 4 that the item specs share, each by way of
 * the pile, against the seeded archive (`apps/server/scripts/archiveSeed/
 * archivePlan.ts`).
 */

/**
 * Read the exact first frame from the response caused by opening its owned
 * burst.
 */
export async function getFirstFrameFromBurstOpening(
  options: Readonly<{
    page: Page;
    activate: (cover: Locator) => Promise<void>;
  }>,
): Promise<{ frame: Locator; itemId: string }> {
  const { page, activate } = options;
  const stack = page
    .locator("[data-burst-id]")
    .filter({ has: page.getByRole("button", { name: /\b45 photos$/ }) });
  await expect(stack).toHaveCount(1);
  const burstId = await stack.getAttribute("data-burst-id");
  expect(burstId).toBeTruthy();
  const answer = page.waitForResponse((response) => {
    return new URL(response.url()).pathname === `/api/bursts/${burstId}/frames`;
  });
  await activate(stack.getByRole("button").first());
  const response = await answer;
  expect(response.status()).toBe(200);
  const { frames } = burstFramesResponseSchema.parse(await response.json());
  expect(frames).toHaveLength(45);
  const firstFrames = frames.filter((frame) => {
    return frame.position === 1;
  });
  expect(firstFrames).toHaveLength(1);
  const itemId = firstFrames[0]!.itemId;
  const fan = page.locator(`[data-fan-row="${burstId}"]`);
  await expect(
    fan.getByRole("button", { name: "Collapse", exact: true }),
  ).toBeVisible();
  const frame = fan.locator(`button[data-item-id="${itemId}"]`);
  await expect(frame).toHaveCount(1);
  await expect(frame).toBeVisible();
  await expect(frame).toBeInViewport();
  await expect(frame).toHaveAccessibleName(/26 September 2026/);
  return { frame, itemId };
}

/**
 * Opens 26 September's actual position-one frame without another detail read.
 */
export async function openFirstFrameOfBurst(page: Page): Promise<void> {
  await page.goto("/?at=2026-09-26");
  const { frame, itemId } = await getFirstFrameFromBurstOpening({
    page,
    activate: (cover) => {
      return cover.click();
    },
  });
  await frame.click();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`, "u"));
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

/**
 * Open the ancillary controls through the actual accessible photo details
 * trigger.
 */
export async function openPhotoDetails(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "More photo details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Photo details", exact: true }),
  ).toBeVisible();
}

/** Close the photo drawer before interacting with its underlying route. */
export async function closePhotoDetails(page: Page): Promise<void> {
  const details = page.getByRole("dialog", {
    name: "Photo details",
    exact: true,
  });
  await details
    .getByRole("button", { name: "Close photo details", exact: true })
    .click();
  await expect(details).toBeHidden();
}
