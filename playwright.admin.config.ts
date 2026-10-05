import { defineConfig, devices } from "@playwright/test";
/** Isolated migrated catalogs avoid the ordinary suite's shared archive state. */
export default defineConfig({
  testDir: "e2e/admin",
  testMatch: "**/*.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
