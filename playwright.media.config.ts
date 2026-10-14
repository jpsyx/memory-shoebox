import { defineConfig, devices } from "@playwright/test";

/** Local HTTP measurements exercise browser caching without interception. */
export default defineConfig({
  testDir: "e2e/media",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 180000,
  reporter: "list",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    ...(process.env.MEDIA_FIREFOX === "1"
      ? [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }]
      : []),
  ],
});
