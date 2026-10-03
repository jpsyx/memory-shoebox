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

/** The local S3 stand-in, away from the API above and from `pnpm dev`. */
export const E2E_FAKE_S3_PORT = 9099;

/**
 * Where the bucket is, for the server under test and therefore for every URL
 * it presigns.
 *
 * **`127.0.0.1` rather than `localhost`**, because the stand-in listens on the
 * IPv4 loopback alone and two clients reach it: the AWS SDK inside the server
 * and the browser. Naming the address leaves neither of them to choose between
 * `::1` and `127.0.0.1` for a name.
 */
export const E2E_FAKE_S3_URL = `http://127.0.0.1:${E2E_FAKE_S3_PORT}`;

/**
 * The key prefix the server under test files every object under.
 *
 * Named, and handed to the server below as `B2_KEY_PREFIX`, rather than left
 * to the `test` default that `NODE_ENV=test` would give it, for the reason the
 * rest of that map is explicit: Playwright layers it over `process.env`, so a
 * `B2_KEY_PREFIX` exported in a developer's shell would otherwise move the keys
 * the specs read out of the stand-in's log. The stand-in stores whatever key
 * it is sent, so the prefix is transparent to it, and a spec that inspects a
 * raw key has to expect this one.
 */
export const E2E_B2_KEY_PREFIX = "test";

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
 * **The bucket is the local stand-in**, `support/fakeS3Server/`, and the key
 * is a placeholder, so nothing a run does can reach Backblaze or cost
 * storage. The stand-in checks no signature, which is why any key will do.
 */
export const E2E_SERVER_ENVIRONMENT = {
  NODE_ENV: "test",
  PORT: String(E2E_PORT),
  HOST: "127.0.0.1",
  DATABASE_PATH: E2E_DATABASE_PATH,
  SESSION_SECRET: "e2e-session-secret-at-least-32-characters",
  // The end-to-end build's own folder, which holds the upload harness beside
  // the app. `dist` never does: see `E2E_BUILD_ENVIRONMENT` below.
  WEB_DIST_PATH: join(REPOSITORY_ROOT, "apps/web/dist-e2e"),
  B2_KEY_ID: "key-id",
  B2_APPLICATION_KEY: "application-key",
  B2_BUCKET: "memory-shoebox-media",
  B2_ENDPOINT: E2E_FAKE_S3_URL,
  B2_REGION: "us-west-004",
  B2_KEY_PREFIX: E2E_B2_KEY_PREFIX,
  RESEND_API_KEY: "",
  ENABLE_FAKE_EMAIL: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
};

/**
 * What the build half of the web server command reads.
 *
 * `pnpm build` runs inside the same command as the server, so this is layered
 * into that command's environment beside `E2E_SERVER_ENVIRONMENT`. It asks the
 * web build for the upload harness as well as the app, which no other build
 * does, and the build then writes to `apps/web/dist-e2e` rather than `dist`:
 * see `apps/web/vite.config.ts`.
 */
export const E2E_BUILD_ENVIRONMENT = {
  WEB_BUILD_UPLOAD_PROOF: "true",
};
