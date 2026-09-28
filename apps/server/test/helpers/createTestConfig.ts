import { parseConfig, type Config } from "../../src/config.ts";

/**
 * A parsed `Config` carrying placeholder credentials.
 *
 * They are deliberately not a real key of any kind. Nothing in the test suite
 * may reach Backblaze or Resend, so a test that somehow did would fail at the
 * network rather than send something.
 *
 * It lives apart from `createTestApp.ts` because a test can want the
 * configuration without wanting an application: `test/b2/client.test.ts`
 * signs URLs and nothing else, and importing it from there would pull in
 * Fastify, Kysely, better-sqlite3 and the migrator to read five strings.
 *
 * @param environment Variables to override, or add to, the placeholders.
 * @returns The parsed configuration, exactly as the server would read it.
 */
export function createTestConfig(
  environment: Record<string, string | undefined> = {},
): Config {
  return parseConfig({
    // Named rather than left to the schema's default, because the fake email
    // gate asks whether the environment was explicitly identified and treats
    // an unset `NODE_ENV` as production. This is what the runner sets anyway.
    NODE_ENV: "test",
    SESSION_SECRET: "a".repeat(32),
    B2_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "application-key",
    B2_BUCKET: "memory-shoebox-media",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
    ...environment,
  });
}
