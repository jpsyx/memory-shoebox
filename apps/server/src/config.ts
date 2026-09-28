import { hkdfSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Backblaze B2 credentials and bucket layout. */
export type B2Config = {
  /** Backblaze calls this the "keyID" of an application key. */
  keyId: string;
  /** Backblaze calls this the "applicationKey". Shown only once at creation. */
  applicationKey: string;
  bucket: string;
  /** S3-compatible endpoint, for example https://s3.us-west-004.backblazeb2.com */
  endpoint: string;
  /** S3-compatible region, for example us-west-004. */
  region: string;
  /** Key prefix under which generated thumbnails are stored in the bucket. */
  thumbnailPrefix: string;
};

/** Parsed, validated server configuration. */
export type Config = {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  host: string;
  /** Filesystem path of the SQLite catalog. On Fly.io this lives on a volume. */
  databasePath: string;
  /**
   * The one secret a self-hoster generates. At least 32 characters.
   *
   * It protects sign-in codes rather than the session cookie: the cookie is
   * an opaque random token whose SHA-256 is a row in `sessions`, so nothing
   * about it is signed or encrypted.
   */
  sessionSecret: string;
  /** `HKDF-SHA256(sessionSecret)`. Never logged, never served. */
  signInCodePepper: Buffer;
  /** Directory holding the built web app. Served at the root in production. */
  webDistPath: string;
  b2: B2Config;
  /**
   * Resend API key. **Optional**: a Shoebox with no key starts and serves
   * every route, and its mail sits `queued` until a key arrives. Refusing to
   * boot would make first-run setup impossible, because an admin has to reach
   * the settings surface to configure mail at all, and an existing session
   * must survive a mail outage (`docs/architecture.md`).
   */
  resendApiKey: string | undefined;
};

/** The built web app, relative to this file, when WEB_DIST_PATH is unset. */
const DEFAULT_WEB_DIST_PATH = fileURLToPath(
  new URL("../../web/dist", import.meta.url),
);

const environmentSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PATH: z.string().default("./data/memory-shoebox.db"),
  SESSION_SECRET: z
    .string()
    .min(
      32,
      "must be at least 32 characters; generate one with `openssl rand -hex 32`",
    ),
  WEB_DIST_PATH: z.string().default(DEFAULT_WEB_DIST_PATH),
  B2_KEY_ID: z.string().min(1),
  B2_APPLICATION_KEY: z.string().min(1),
  B2_BUCKET: z.string().min(1),
  B2_ENDPOINT: z.url(),
  B2_REGION: z.string().min(1),
  B2_THUMBNAIL_PREFIX: z.string().default(".memory-shoebox-thumbnails"),
  // A copied `.env.example` leaves `RESEND_API_KEY=` unfilled, and Node reads
  // that as "" rather than as absent. An empty value means "no key yet", not
  // a malformed one, so it must not stop the server booting.
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => {
      return value === "" ? undefined : value;
    }),
});

/**
 * The pepper every sign-in code is HMAC'd with, derived from the one secret a
 * self-hoster generates.
 *
 * `data-models.md` § `sign_in_codes` explains what it buys: six digits is a
 * 10^6 space, so a leaked table of plain SHA-256 hashes is reversed instantly
 * with a rainbow table of a million entries, and a read-only database leak (a
 * copied volume, a stray backup) yields nothing without this value.
 *
 * Derived rather than used raw so that a later use of `SESSION_SECRET` for
 * something else cannot also be a use of the pepper. Rotating the secret
 * invalidates every live code, which last ten minutes, and no session, because
 * a session is a row rather than a signed token.
 */
function _makeSignInCodePepperFromSecret(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "", "memory-shoebox:sign-in-code-pepper", 32),
  );
}

/** Renders every Zod issue as `VARIABLE: reason`, one per line. */
function _formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    return `  - ${issue.path.join(".")}: ${issue.message}`;
  });
  return `Invalid server configuration:\n${lines.join("\n")}`;
}

/**
 * Parses and validates server configuration from an environment map.
 *
 * Takes the environment explicitly rather than reading `process.env`, so tests
 * can exercise it without mutating global state.
 *
 * @param env The environment variables to read.
 * @returns The validated configuration.
 * @throws If any variable is missing or malformed. The error names every
 *   offending variable at once, so a self-hoster fixes them in one pass.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = environmentSchema.safeParse(env);
  if (!result.success) {
    throw new Error(_formatIssues(result.error));
  }

  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === "production",
    port: parsed.PORT,
    host: parsed.HOST,
    databasePath: parsed.DATABASE_PATH,
    sessionSecret: parsed.SESSION_SECRET,
    signInCodePepper: _makeSignInCodePepperFromSecret(parsed.SESSION_SECRET),
    webDistPath: parsed.WEB_DIST_PATH,
    b2: {
      keyId: parsed.B2_KEY_ID,
      applicationKey: parsed.B2_APPLICATION_KEY,
      bucket: parsed.B2_BUCKET,
      endpoint: parsed.B2_ENDPOINT,
      region: parsed.B2_REGION,
      thumbnailPrefix: parsed.B2_THUMBNAIL_PREFIX.replace(/\/+$/, ""),
    },
    resendApiKey: parsed.RESEND_API_KEY,
  };
}

let cachedConfig: Config | undefined;

/** Returns the process-wide configuration, parsing `process.env` once. */
export function getConfig(): Config {
  cachedConfig ??= parseConfig(process.env);
  return cachedConfig;
}
