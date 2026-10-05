import { mkdir } from "node:fs/promises";
import { test } from "../admin.fixtures.ts";
import { seedAdminVisualHistory } from "./seedAdminVisualHistory.ts";
import { prepareAdminVisual } from "./prepareAdminVisual.ts";
import { captureAdminVisual } from "./captureAdminVisual.ts";
Object.entries({
  settings: ["default", "renaming", "tidy", "timezone", "mail-failing"],
  presence: ["default", "never-arrived", "one-item"],
  changes: ["default", "authority", "person", "gone", "empty"],
} as const).forEach(([surface, states]) => {
  states.forEach((state) => {
    test(`${surface}/${state} fits all three widths and both actual OS schemes`, async ({
      page,
      catalog,
    }) => {
      const directory =
        state === "timezone"
          ? ".playwright-mcp/step9-acceptance/live/final-timezone-preview"
          : ".playwright-mcp/step9-acceptance/live/final-admin";
      await mkdir(directory, { recursive: true });
      const scenario = { page, catalog, surface, state, directory };
      await seedAdminVisualHistory(scenario);
      for (const width of [400, 768, 1280]) {
        for (const scheme of ["light", "dark"] as const) {
          const capture = { ...scenario, width, scheme };
          await prepareAdminVisual(capture);
          await captureAdminVisual(capture);
        }
      }
    });
  });
});
