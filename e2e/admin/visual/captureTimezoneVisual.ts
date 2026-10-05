import { expect } from "../admin.fixtures.ts";
import type { AdminVisualCapture } from "./visual.types.ts";
/** Captures timezone consequences and checks that their confirmation fits. */
export async function captureTimezoneVisual({
  page,
  directory,
  width,
  scheme,
}: Readonly<AdminVisualCapture>): Promise<void> {
  const impact = await page
    .getByRole("region", { name: "What time it is here", exact: true })
    .boundingBox();
  expect(impact).not.toBeNull();
  await page.screenshot({
    path: `${directory}/impact-${width}-${scheme}.png`,
    fullPage: true,
    clip: impact!,
  });
  const confirmation = await page
    .getByRole("button", { name: "Confirm timezone change" })
    .boundingBox();
  expect(confirmation).not.toBeNull();
  expect(confirmation!.x + confirmation!.width).toBeLessThanOrEqual(width);
}
