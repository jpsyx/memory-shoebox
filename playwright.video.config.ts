import { defineConfig, devices } from "@playwright/test";

/** Isolated catalogs verify the production video viewer in Chromium and WebKit. */
export default defineConfig({
  testDir: "e2e/admin",
  testMatch: "**/video-*.spec.ts",
  workers: 1,
  reporter: "list",
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "video-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "video-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
