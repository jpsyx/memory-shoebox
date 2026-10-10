import type { Environment } from "./environmentHelpers/environmentHelpers";

/** Runtime keys managed here, including optional keys absent from examples. */
const MANAGED_KEYS = new Set([
  "SESSION_SECRET",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_BUCKET",
  "B2_ENDPOINT",
  "B2_REGION",
  "B2_KEY_PREFIX",
  "B2_THUMBNAIL_PREFIX",
  "RESEND_API_KEY",
  "NODE_ENV",
  "ENABLE_FAKE_EMAIL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "PORT",
  "HOST",
  "DATABASE_PATH",
  "WEB_DIST_PATH",
]);

/** Finds stale managed secrets without touching unrelated operator keys. */
export function getStaleSecretNamesFromRemote(options: {
  server: Environment;
  secretsJson: string;
}): string[] {
  let secrets: unknown;
  try {
    secrets = JSON.parse(options.secretsJson);
  } catch {
    throw new Error("Fly returned invalid secret metadata JSON");
  }
  if (
    !Array.isArray(secrets) ||
    !secrets.every((secret: unknown) => {
      return (
        typeof secret === "object" &&
        secret !== null &&
        "name" in secret &&
        typeof secret.name === "string" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(secret.name)
      );
    })
  ) {
    throw new Error("Fly returned unsupported secret metadata");
  }
  return secrets
    .map((secret: { name: string }) => {
      return secret.name;
    })
    .filter((name) => {
      return MANAGED_KEYS.has(name) && !Object.hasOwn(options.server, name);
    });
}
