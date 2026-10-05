import { expect } from "../admin.fixtures.ts";
import { waitForVisualMedia } from "../support/waitForVisualMedia.ts";
import { getContrastFailuresFromPage } from "../../support/getContrastFailuresFromPage/getContrastFailuresFromPage.ts";
import { captureTimezoneVisual } from "./captureTimezoneVisual.ts";
import type { AdminVisualCapture } from "./visual.types.ts";
/**
 * Checks fit and scheme, writes evidence, and retains the contrast assertions.
 */
export async function captureAdminVisual(
  options: Readonly<AdminVisualCapture>,
): Promise<void> {
  const { page, directory, surface, state, width, scheme } = options;
  await waitForVisualMedia(page);
  expect(
    await page.evaluate(() => {
      return document.documentElement.scrollWidth <= innerWidth;
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    }),
  ).toBe(scheme === "light" ? "rgb(201, 214, 237)" : "rgb(13, 24, 54)");
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({
    path: `${directory}/${surface}-${state}-${width}-${scheme === "light" ? "day" : "night"}.png`,
    fullPage: true,
  });
  if (state === "timezone") {
    await captureTimezoneVisual(options);
  }
  if (width === 400 && state === "default") {
    expect(await getContrastFailuresFromPage(page)).toEqual([]);
  }
}
