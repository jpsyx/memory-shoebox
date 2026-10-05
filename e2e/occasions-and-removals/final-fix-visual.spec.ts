import { mkdir, writeFile } from "node:fs/promises";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { expect, test } from "./asking-occasions.fixtures.ts";
import { getControlMetricsFromLocator } from "./support/browserMeasurementHelpers/browserMeasurementHelpers.ts";
import { showFinalFixVisualState } from "./support/showFinalFixVisualState.ts";
const FINAL_FIX_STATES = [
  "queue-paging",
  "queue-error",
  "fix-paging",
  "fix-error",
  "raised",
  "directory-paging",
  "directory-error",
  "selection-error",
] as const satisfies readonly string[];

test("recovery and paging controls stay enabled, regain focus and fit narrow viewports in both schemes", async ({
  adminPage,
}) => {
  test.setTimeout(120_000);
  const phase = process.env.STEP8B_VISUAL_PHASE ?? "after";
  const directory = `${ACCEPTANCE_DIRECTORY}/final-fix/${phase}`;
  await mkdir(directory, { recursive: true });
  const manifest = [];
  for (const state of FINAL_FIX_STATES) {
    for (const scheme of ["light", "dark"] as const) {
      await adminPage.setViewportSize({ width: 400, height: 900 });
      const label = await showFinalFixVisualState({
        page: adminPage,
        state,
        scheme,
      });
      const control = adminPage.getByRole("button", {
        name: label,
        exact: true,
      });
      await expect(control).toBeEnabled();
      await control.focus();
      await adminPage.keyboard.press("Tab");
      await adminPage.keyboard.press("Shift+Tab");
      await expect(control).toBeFocused();
      const metrics = await getControlMetricsFromLocator(control);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(metrics.width);
      await adminPage.screenshot({
        path: `${directory}/${state}-${scheme}.png`,
        fullPage: true,
      });
      manifest.push({ state, scheme, label, metrics });
    }
  }
  await writeFile(
    `${directory}/manifest.json`,
    JSON.stringify(manifest, null, 2),
  );
});
