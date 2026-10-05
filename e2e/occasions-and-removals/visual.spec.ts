import type { Browser, Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import { getDocumentMetricsFromPage } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import type { DocumentMetrics } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.types.ts";
import { VISUAL_STATES } from "./support/prototypeStateHelpers/prototypeStateHelpers.constants.ts";
import {
  hidePrototypeSwitcher,
  showControlledVisualState,
} from "./support/prototypeStateHelpers/prototypeStateHelpers.ts";
type VisualComparisonOptions = {
  production: Page;
  prototype: Page;
  width: number;
  referenceUrl: string;
  scheme: "light" | "dark";
  stem: string;
};
async function _captureVisualComparison({
  production,
  prototype,
  width,
  referenceUrl,
  scheme,
  stem,
}: Readonly<VisualComparisonOptions>): Promise<void> {
  await production.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/matrix/${stem}-production.png`,
    fullPage: true,
  });
  await prototype.setViewportSize({ width, height: 900 });
  await prototype.goto(
    `${referenceUrl}&rendition=${scheme === "dark" ? "night" : "day"}`,
  );
  await hidePrototypeSwitcher(prototype);
  await prototype.evaluate(
    async (rendition) => {
      await document.fonts.ready;
      document.documentElement.dataset.rendition = rendition;
      document.documentElement.setAttribute(
        "data-mantine-color-scheme",
        rendition === "night" ? "dark" : "light",
      );
    },
    scheme === "dark" ? "night" : "day",
  );
  await prototype.screenshot({
    path: `${ACCEPTANCE_DIRECTORY}/matrix/${stem}-prototype.png`,
    fullPage: true,
  });
}
type VisualMatrixEntry = {
  stem: string;
  referenceUrl: string;
  metrics: DocumentMetrics;
  evidence: string;
};
type VisualMatrixOptions = {
  browser: Browser;
  surface: string;
  state: string;
  captureCase: (
    options: Readonly<
      Pick<VisualComparisonOptions, "prototype" | "width" | "scheme">
    >,
  ) => Promise<VisualMatrixEntry>;
};
async function _captureVisualMatrix({
  browser,
  surface,
  state,
  captureCase,
}: Readonly<VisualMatrixOptions>): Promise<void> {
  await mkdir(`${ACCEPTANCE_DIRECTORY}/matrix`, { recursive: true });
  const prototype = await browser.newPage();
  const manifest: VisualMatrixEntry[] = [];
  try {
    for (const width of [1280, 768, 400]) {
      for (const scheme of ["light", "dark"] as const) {
        manifest.push(await captureCase({ prototype, width, scheme }));
      }
    }
    await writeFile(
      `${ACCEPTANCE_DIRECTORY}/matrix/${surface}-${state}.json`,
      JSON.stringify(manifest, null, 2),
    );
  } finally {
    await prototype.close();
  }
}
Object.entries(VISUAL_STATES).forEach(([surface, states]) => {
  states.forEach((state) => {
    test(`controlled ${surface}/${state} has no horizontal overflow at all sizes and schemes`, async ({
      adminPage,
      browser,
    }) => {
      test.setTimeout(60_000);
      await _captureVisualMatrix({
        browser,
        surface,
        state,
        captureCase: async ({ prototype, width, scheme }) => {
          await adminPage.setViewportSize({ width, height: 900 });
          const referenceUrl = await showControlledVisualState({
            page: adminPage,
            surface,
            state,
            scheme,
          });
          await adminPage.getByRole("heading").first().waitFor();
          await expect(adminPage.locator("main")).not.toContainText(
            "Reading the occasion",
          );
          const metrics = await getDocumentMetricsFromPage(adminPage);
          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
          const stem = `${surface}-${state}-${width}-${scheme}`;
          await _captureVisualComparison({
            production: adminPage,
            prototype,
            width,
            referenceUrl,
            scheme,
            stem,
          });
          return {
            stem,
            referenceUrl,
            metrics,
            evidence: "controlled visual comparison",
          };
        },
      });
    });
  });
});
