import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { createApp, type AppDeps } from "../../src/app.ts";
import { parseConfig, type Config } from "../../src/config.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types.ts";
import { createFakeB2Client, type FakeB2Client } from "./fakeB2.ts";

/** Everything a test needs to drive the real application. */
export type TestApp = {
  app: FastifyInstance;
  database: Kysely<Database>;
  b2: FakeB2Client;
  config: Config;
  /** Closes the app and the database. Always call it, or vitest will hang. */
  close: () => Promise<void>;
};

/**
 * Placeholder credentials.
 *
 * They are deliberately not a real key of any kind. Nothing in the test suite
 * may reach Backblaze or Resend, so a test that somehow did would fail at the
 * network rather than send something.
 */
export function buildTestConfig(
  environment: Record<string, string | undefined> = {},
): Config {
  return parseConfig({
    SESSION_SECRET: "a".repeat(32),
    B2_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "application-key",
    B2_BUCKET: "memory-shoebox-media",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
    ...environment,
  });
}

/**
 * Builds the real application over an in-memory, fully migrated database.
 *
 * Background work is off by default: a test that wants a job or the mail queue
 * to run calls it directly rather than waiting on an interval.
 *
 * A caller passing its own `b2` gets that client wired into the app and handed
 * back on `TestApp`, so an assertion about what Backblaze was asked to do is
 * an assertion about the client the app actually used. The override is narrowed
 * to `FakeB2Client` because `TestApp.b2` promises the fake's recording surface.
 */
export async function createTestApp(
  overrides: Partial<Omit<AppDeps, "b2">> & { b2?: FakeB2Client } = {},
): Promise<TestApp> {
  const database = overrides.database ?? createDatabase(":memory:");
  await migrateToLatest(database);
  const config = overrides.config ?? buildTestConfig();
  const b2 = overrides.b2 ?? createFakeB2Client();

  const app = await createApp({
    config,
    database,
    logger: false,
    ...overrides,
    // After the spread, so no override can put a different client in the app
    // than the one returned below.
    b2,
  });

  return {
    app,
    database,
    b2,
    config,
    close: async () => {
      await app.close();
      await database.destroy();
    },
  };
}
