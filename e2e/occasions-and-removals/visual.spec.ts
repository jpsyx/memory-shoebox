import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "./asking-occasions.fixtures.ts";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { VISUAL_STATES } from "./support/prototypeStateHelpers/prototypeStateHelpers.constants.ts";
import {
  showControlledVisualState,
  hidePrototypeSwitcher,
} from "./support/prototypeStateHelpers/prototypeStateHelpers.ts";

for (const [surface, states] of Object.entries(VISUAL_STATES)) {
  for (const state of states) {
    test(`controlled comparison ${surface}/${state} at all sizes and schemes`, async ({
      adminPage,
      browser,
    }) => {
      test.setTimeout(60_000);
      await mkdir(`${ACCEPTANCE_DIRECTORY}/matrix`, { recursive: true });
      const prototype = await browser.newPage();
      const manifest = [];
      try {
        for (const width of [1280, 768, 400]) {
          for (const scheme of ["light", "dark"] as const) {
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
            await adminPage.evaluate(async () => {
              await document.fonts.ready;
              document.documentElement.dataset.rendition = matchMedia(
                "(prefers-color-scheme: dark)",
              ).matches
                ? "night"
                : "day";
            });
            const metrics = await adminPage.evaluate(() => {
              return {
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                rendition: document.documentElement.dataset.rendition,
              };
            });
            expect(metrics.scrollWidth).toBeLessThanOrEqual(
              metrics.clientWidth,
            );
            const stem = `${surface}-${state}-${width}-${scheme}`;
            await adminPage.screenshot({
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
            manifest.push({
              stem,
              referenceUrl,
              metrics,
              evidence: "controlled visual comparison",
            });
          }
        }
        await writeFile(
          `${ACCEPTANCE_DIRECTORY}/matrix/${surface}-${state}.json`,
          JSON.stringify(manifest, null, 2),
        );
      } finally {
        await prototype.close();
      }
    });
  }
}
