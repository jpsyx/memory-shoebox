import { defineConfig, devices } from "@playwright/test";

/** Sequential projects each receive a new disposable catalog for every case. */
export default defineConfig({
  outputDir: `test-results/comment-tagging-${process.pid}`,
  testDir: "e2e/comment-tagging",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "webkit-phone",
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
    },
  ],
});
