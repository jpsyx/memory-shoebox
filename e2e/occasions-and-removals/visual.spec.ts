import { mkdir, writeFile } from "node:fs/promises";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import { getDocumentMetricsFromPage } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import { VISUAL_STATES } from "./support/visualStateHelpers/visualStateHelpers.constants.ts";
import { showControlledVisualState } from "./support/visualStateHelpers/visualStateHelpers.ts";

for (const [surface, states] of Object.entries(VISUAL_STATES)) {
  for (const state of states) {
    test(`controlled ${surface}/${state} has no horizontal overflow at all sizes and schemes`, async ({
      adminPage,
    }) => {
      test.setTimeout(60_000);
      await mkdir(`${ACCEPTANCE_DIRECTORY}/matrix`, { recursive: true });
      const manifest = [];
      for (const width of [1280, 768, 400]) {
        for (const scheme of ["light", "dark"] as const) {
          await adminPage.setViewportSize({ width, height: 900 });
          const url = await showControlledVisualState({
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
            await Promise.all(
              Array.from(document.images, (image) => {
                return image.decode().catch(() => {});
              }),
            );
          });
          const metrics = await getDocumentMetricsFromPage(adminPage);
          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
          expect(
            await adminPage.evaluate(() => {
              return Array.from(document.images).every((image) => {
                return image.complete && image.naturalWidth > 0;
              });
            }),
          ).toBe(true);
          const stem = `${surface}-${state}-${width}-${scheme}`;
          await adminPage.screenshot({
            path: `${ACCEPTANCE_DIRECTORY}/matrix/${stem}-production.png`,
            fullPage: true,
          });
          manifest.push({
            stem,
            url,
            metrics,
            evidence:
              "controlled production layout assertion; retained generated media",
          });
        }
      }
      await writeFile(
        `${ACCEPTANCE_DIRECTORY}/matrix/${surface}-${state}.json`,
        JSON.stringify(manifest, null, 2),
      );
    });
  }
}
