import { defineConfig, devices } from "@playwright/test";

/** Fresh-catalog proof, independent of the seeded standard E2E server. */
export default defineConfig({
  testDir: "e2e/setup",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/setup/setup.build.ts",
  outputDir: "test-results/setup",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "setup-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
