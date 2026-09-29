import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_SERVER_ENVIRONMENT,
} from "./e2e/support/e2eEnvironment.ts";

/**
 * The end-to-end layer.
 *
 * **One Fastify process serves both the API and the built app**, which is the
 * production topology (`docs/architecture.md`): one origin, no CORS, no proxy,
 * and the static-serving path exercised rather than assumed. The cost is a
 * build before the run, which `pnpm check` does anyway.
 *
 * **One worker, and not for speed.** There is one SQLite catalog and one
 * member in it, and the specs sign devices in and out of that member. Two
 * workers would be two runs fighting over the same device list.
 *
 * This is not part of `pnpm check`: it needs a browser installed and a port.
 * It is `pnpm test:e2e`, run deliberately.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: "list",
  use: {
    baseURL: E2E_BASE_URL,
    // Both of these cost nothing on a passing run, because Playwright throws
    // away what it recorded for a test that passed. `on-first-retry` was the
    // wrong pairing with `retries: 0`: locally there is never a first retry,
    // so a failure left a stack trace and nothing to look at. These two leave
    // a trace and a picture of the moment it went wrong, on the run that
    // actually failed.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Gives the catalog lock back at the end of a run. Taking it is the first
  // thing `deleteE2eCatalog.ts` does; this is the same file, imported rather
  // than executed, so importing it deletes nothing.
  globalTeardown: "./e2e/support/deleteE2eCatalog.ts",
  webServer: {
    // The catalog is deleted here rather than in a Playwright `globalSetup`,
    // which runs only after this server is already up and holding the file
    // open. `deleteE2eCatalog.ts` says what goes wrong when it does, and it
    // takes a lock first so that a second run started over a live one is
    // refused rather than quietly corrupting both.
    command:
      "node e2e/support/deleteE2eCatalog.ts && pnpm build && pnpm --filter @memory-shoebox/server start",
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: E2E_SERVER_ENVIRONMENT,
  },
});
