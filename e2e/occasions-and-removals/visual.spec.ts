import type { Page } from "@playwright/test";
import { waitForVisualMedia } from "../admin/support/waitForVisualMedia.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import { getDocumentMetricsFromPage } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import { VISUAL_STATES } from "./support/visualStateHelpers/visualStateHelpers.constants.ts";
import { showControlledVisualState } from "./support/visualStateHelpers/showControlledVisualState.ts";
type ControlledVisualCapture = {
  page: Page;
  surface: string;
  state: string;
  width: number;
  scheme: "light" | "dark";
};
type ControlledVisualEvidence = {
  stem: string;
  url: string;
  metrics: Awaited<ReturnType<typeof getDocumentMetricsFromPage>>;
  evidence: string;
};

async function _captureControlledVisual({
  page,
  surface,
  state,
  width,
  scheme,
}: Readonly<ControlledVisualCapture>): Promise<ControlledVisualEvidence> {
  await page.setViewportSize({ width, height: 900 });
  const url = await showControlledVisualState({
    page,
    surface,
    state,
    scheme,
  });
  await page.getByRole("heading").first().waitFor();
  await expect(page.locator("main")).not.toContainText("Reading the occasion");
  await waitForVisualMedia(page);
  const metrics = await getDocumentMetricsFromPage(page);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(
    await page.evaluate(() => {
      return Array.from(document.images).every((image) => {
        return image.complete && image.naturalWidth > 0;
      });
    }),
  ).toBe(true);
  const stem = `${surface}-${state}-${width}-${scheme}`;
  await page.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/matrix/${stem}-production.png`,
    fullPage: true,
  });
  return {
    stem,
    url,
    metrics,
    evidence:
      "controlled production layout assertion; retained generated media",
  };
}
Object.entries(VISUAL_STATES).forEach(([surface, states]) => {
  states.forEach((state) => {
    test(`controlled ${surface}/${state} has no horizontal overflow at all sizes and schemes`, async ({
      adminPage,
    }) => {
      test.setTimeout(60000);
      await mkdir(`${ACCEPTANCE_DIRECTORY}/matrix`, { recursive: true });
      const manifest = [];
      for (const width of [1280, 768, 400]) {
        for (const scheme of ["light", "dark"] as const) {
          manifest.push(
            await _captureControlledVisual({
              page: adminPage,
              surface,
              state,
              width,
              scheme,
            }),
          );
        }
      }
      await writeFile(
        `${ACCEPTANCE_DIRECTORY}/matrix/${surface}-${state}.json`,
        JSON.stringify(manifest, null, 2),
      );
    });
  });
});
