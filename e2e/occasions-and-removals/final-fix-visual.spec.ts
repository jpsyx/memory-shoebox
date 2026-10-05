import { mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "./asking-occasions.fixtures.ts";
import { ACCEPTANCE_DIRECTORY } from "./asking-occasions.constants.ts";
import { showFinalFixVisualState } from "./support/finalFixVisualHelpers/finalFixVisualHelpers.ts";

test("controlled recovery, paging and affected-occasion controls in both schemes with narrow keyboard focus", async ({
  adminPage,
}) => {
  test.setTimeout(120_000);
  const phase = process.env.STEP8B_VISUAL_PHASE ?? "after";
  const directory = `${ACCEPTANCE_DIRECTORY}/final-fix/${phase}`;
  await mkdir(directory, { recursive: true });
  const manifest = [];
  for (const state of [
    "queue-paging",
    "queue-error",
    "fix-paging",
    "fix-error",
    "raised",
    "directory-paging",
    "directory-error",
    "selection-error",
  ]) {
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
      const metrics = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          foreground: style.color,
          background: style.backgroundColor,
          outline: style.outline,
          left: bounds.left,
          right: bounds.right,
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
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
