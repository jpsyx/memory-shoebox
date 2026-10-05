import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_BUILD_ENVIRONMENT,
  E2E_FAKE_S3_URL,
  E2E_SERVER_ENVIRONMENT,
} from "./e2e/support/e2eEnvironment.constants.ts";

/**
 * The end-to-end layer.
 *
 * **One Fastify process serves both the API and the built app**, which is the
 * production topology (`docs/architecture.md`): one origin, no CORS, no proxy,
 * and the static-serving path exercised rather than assumed. The cost is a
 * build before the run, which `pnpm check` does anyway. **The bucket is the
 * one stand-in**: a second process,
 * `e2e/support/createFakeS3Server/`, answering the S3 calls the upload flow
 * makes, so a run needs no Backblaze key.
 *
 * **One worker, and not for speed.** There is one SQLite catalog and one
 * member in it, and the specs sign devices in and out of that member. Two
 * workers would be two runs fighting over the same device list.
 *
 * **Four projects, run in order.** `chromium` is every spec except the upload
 * engine and routed surface cases. `upload-setup` signs the uploader in once,
 * and depends on `chromium`,
 * which is what puts every upload after `empty.spec.ts`. `upload-chrome` and
 * `upload-webkit` run `upload/__tests__/` and `upload-surface/` in installed
 * Chrome and WebKit, the two engines a family's phones and laptops use.
 *
 * This is not part of `pnpm check`: it needs browsers installed and two ports.
 * It is `pnpm test:e2e`, run deliberately.
 */
export default defineConfig({
  testDir: "e2e",
  metadata: { adminWebDistDirectory: "dist-e2e" },
  // Spec files only. `e2e/support/` holds Vitest files too, the stand-in's
  // own tests, and Playwright's default match would run those as specs.
  testMatch: "**/*.spec.ts",
  testIgnore: "**/setup/**",
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
  projects: [
    {
      name: "chromium",
      testIgnore: [
        "**/setup/**",
        "**/upload/__tests__/*.spec.ts",
        "**/upload-surface/*.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-setup",
      testMatch: "**/upload.setup.ts",
      dependencies: ["chromium"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-chrome",
      testMatch: [
        "**/upload/__tests__/*.spec.ts",
        "**/upload-surface/*.spec.ts",
      ],
      dependencies: ["upload-setup"],
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "upload-webkit",
      testMatch: [
        "**/upload/__tests__/*.spec.ts",
        "**/upload-surface/*.spec.ts",
      ],
      dependencies: ["upload-setup"],
      use: { ...devices["Desktop Safari"] },
    },
  ],
  // Gives the catalog lock back at the end of a run. Taking it is the first
  // thing `deleteE2eCatalog.ts` does; this is the same file, imported rather
  // than executed, so importing it deletes nothing.
  globalTeardown: "./e2e/support/deleteE2eCatalog.ts",
  webServer: [
    {
      // The bucket. It holds nothing between runs: it is memory, and it dies
      // with the run.
      command: "node e2e/support/createFakeS3Server/createFakeS3Server.ts",
      url: `${E2E_FAKE_S3_URL}/__fake-s3/health`,
      reuseExistingServer: false,
      timeout: 10_000,
    },
    {
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
      env: { ...E2E_SERVER_ENVIRONMENT, ...E2E_BUILD_ENVIRONMENT },
    },
  ],
});
