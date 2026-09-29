import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The one place the end-to-end stack's shape is written.
 *
 * The config, the global setup and the database helpers all read it, so the
 * port and the catalog cannot drift apart between them.
 */

/**
 * The repository root, found from this file rather than from `process.cwd()`.
 *
 * **The two halves of this run have different working directories.** Playwright
 * runs the specs from the repository root, while the server under test starts
 * through `pnpm --filter @memory-shoebox/server start`, which runs the script
 * in `apps/server`. A relative `DATABASE_PATH` would therefore name two
 * different files: the test would read an empty catalog while the server wrote
 * a full one. Every path below is absolute for that reason.
 */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Away from `pnpm dev`'s 8080, so a running dev server is not in the way. */
export const E2E_PORT = 8099;

/** The catalog this run owns. Deleted at the start of every run. */
export const E2E_DATABASE_PATH = join(
  REPOSITORY_ROOT,
  "apps/server/data/e2e.db",
);

/** Where the browser points. */
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * The environment the server under test runs in.
 *
 * **`RESEND_API_KEY` and `ENABLE_FAKE_EMAIL` are emptied on purpose.** With no
 * service configured the mail worker defers every message back to `queued`
 * without scrubbing it, which is what leaves a sign-in code readable. Playwright
 * hands the command `process.env` with this map layered over it, so both are
 * named and set to the empty string rather than merely left out: a key exported
 * in the developer's shell, or one that reaches the run some other way, would
 * otherwise send real mail and scrub the digits the specs read. `config.ts`
 * reads an empty optional variable as absent, so the empty string is the way to
 * say "no key" rather than a malformed one.
 *
 * The Upstash pair is emptied for the same reason: an inherited credential
 * would put this run's rate limit counters in somebody's shared Redis.
 *
 * The B2 values are placeholders that could not reach Backblaze if anything
 * tried.
 */
export const E2E_SERVER_ENVIRONMENT = {
  NODE_ENV: "test",
  PORT: String(E2E_PORT),
  HOST: "127.0.0.1",
  DATABASE_PATH: E2E_DATABASE_PATH,
  SESSION_SECRET: "e2e-session-secret-at-least-32-characters",
  WEB_DIST_PATH: join(REPOSITORY_ROOT, "apps/web/dist"),
  B2_KEY_ID: "key-id",
  B2_APPLICATION_KEY: "application-key",
  B2_BUCKET: "memory-shoebox-media",
  B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  B2_REGION: "us-west-004",
  RESEND_API_KEY: "",
  ENABLE_FAKE_EMAIL: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
};
