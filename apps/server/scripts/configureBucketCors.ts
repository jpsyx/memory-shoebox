import { fileURLToPath } from "node:url";
import {
  createB2Client,
  type B2Client,
  type BucketCorsRule,
} from "../src/b2/client/client.ts";
import { getConfig } from "../src/config.ts";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { readInstanceSettings } from "../src/settings/readInstanceSettings.ts";

/**
 * Where `pnpm dev` serves the web app, and so where a development upload's
 * PUTs come from. `apps/web/vite.config.ts` pins the port.
 */
export const VITE_DEV_ORIGIN = "http://localhost:5173";

/**
 * The rule's name in Backblaze's own format, so the console says what it is
 * for. Six to fifty letters, digits and hyphens, as Backblaze requires.
 */
export const CORS_RULE_NAME = "memory-shoebox-uploads";

/** How long a browser may cache the preflight answer. */
const CORS_MAX_AGE_SECONDS = 3600;

/** The one line printed whenever the arguments do not make sense. */
export const BUCKET_CORS_USAGE = "Usage: pnpm b2:cors [--apply]";

/** One rule in Backblaze's native CORS format, for the console fallback. */
export type BackblazeCorsRule = {
  corsRuleName: string;
  allowedOrigins: string[];
  allowedOperations: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAgeSeconds: number;
};

/**
 * Reads the command line, or refuses it. `--apply` is the only flag, and
 * without it the script only reports.
 *
 * @param argv The arguments after the script's own name.
 * @returns What to do, or undefined when the caller should print
 *   `BUCKET_CORS_USAGE` and stop.
 */
export function getBucketCorsArgumentsFromArgv(
  argv: readonly string[],
): { isApplying: boolean } | undefined {
  const isEveryArgumentKnown = argv.every((argument) => {
    return argument === "--apply";
  });
  return isEveryArgumentKnown
    ? { isApplying: argv.includes("--apply") }
    : undefined;
}

/**
 * The origins the browser uploads from: the instance's own, from
 * `public.base_url`, and Vite's in development.
 *
 * The development origin is added only when `NODE_ENV` explicitly names a
 * non-production environment (`Config.isKnownNonProduction`), which fails
 * closed: a real bucket whose environment nobody can identify does not start
 * accepting PUTs from `localhost`.
 *
 * @param options.baseUrl `public.base_url`, or undefined while it is unset.
 * @param options.isKnownNonProduction From the server's own config.
 * @returns Each origin once, the instance's first.
 */
export function getCorsOriginsFromBaseUrl(options: {
  baseUrl: string | undefined;
  isKnownNonProduction: boolean;
}): string[] {
  const instanceOrigins =
    options.baseUrl === undefined ? [] : [new URL(options.baseUrl).origin];
  const developmentOrigins = options.isKnownNonProduction
    ? [VITE_DEV_ORIGIN]
    : [];
  return [...new Set([...instanceOrigins, ...developmentOrigins])];
}

/**
 * The one rule direct uploads need (step 6a design, decision 6).
 *
 * `PUT` for the original and its derivatives, `GET` and `HEAD` for reading
 * them back, the `content-type` request header because every presigned PUT
 * signs it, and **`ETag` exposed**, without which the browser cannot read a
 * part's ETag and a multipart upload can never be completed.
 *
 * @param origins From `getCorsOriginsFromBaseUrl`.
 */
export function makeBucketCorsRuleFromOrigins(
  origins: readonly string[],
): BucketCorsRule {
  return {
    allowedOrigins: [...origins],
    allowedMethods: ["PUT", "GET", "HEAD"],
    allowedHeaders: ["content-type"],
    exposeHeaders: ["ETag"],
    maxAgeSeconds: CORS_MAX_AGE_SECONDS,
  };
}

/** Whether `available` holds every one of `needed`, ignoring case, or `*`. */
function _includesEvery(options: {
  available: readonly string[];
  needed: readonly string[];
}): boolean {
  const available = new Set(
    options.available.map((value) => {
      return value.toLowerCase();
    }),
  );
  return (
    available.has("*") ||
    options.needed.every((value) => {
      return available.has(value.toLowerCase());
    })
  );
}

/** Whether one existing rule already does everything `neededRule` does. */
function _isOriginCoveredByRule(options: {
  rule: Readonly<BucketCorsRule>;
  origin: string;
  neededRule: Readonly<BucketCorsRule>;
}): boolean {
  const { rule, neededRule } = options;
  return (
    _includesEvery({
      available: rule.allowedOrigins,
      needed: [options.origin],
    }) &&
    _includesEvery({
      available: rule.allowedMethods,
      needed: neededRule.allowedMethods,
    }) &&
    _includesEvery({
      available: rule.allowedHeaders,
      needed: neededRule.allowedHeaders,
    }) &&
    _includesEvery({
      available: rule.exposeHeaders,
      needed: neededRule.exposeHeaders,
    })
  );
}

/**
 * The needed origins that no single existing rule fully serves.
 *
 * A rule that allows the origin but does not expose `ETag` does not count:
 * single PUTs would work through it and multipart would fail at the end,
 * which is the failure this command exists to prevent.
 *
 * @param options.currentRules What the bucket holds now.
 * @param options.neededRule From `makeBucketCorsRuleFromOrigins`.
 * @returns Empty when there is nothing to write.
 */
export function getUncoveredOriginsFromRules(options: {
  currentRules: readonly BucketCorsRule[];
  neededRule: Readonly<BucketCorsRule>;
}): string[] {
  return options.neededRule.allowedOrigins.filter((origin) => {
    return !options.currentRules.some((rule) => {
      return _isOriginCoveredByRule({
        rule,
        origin,
        neededRule: options.neededRule,
      });
    });
  });
}

/**
 * The same rule in Backblaze's native CORS format, which is what its own
 * tools take: operations are `s3_put`, `s3_get` and `s3_head` rather than
 * HTTP methods.
 *
 * @param rule From `makeBucketCorsRuleFromOrigins`.
 */
export function makeBackblazeCorsRulesFromRule(
  rule: Readonly<BucketCorsRule>,
): BackblazeCorsRule[] {
  return [
    {
      corsRuleName: CORS_RULE_NAME,
      allowedOrigins: [...rule.allowedOrigins],
      allowedOperations: rule.allowedMethods.map((method) => {
        return `s3_${method.toLowerCase()}`;
      }),
      allowedHeaders: [...rule.allowedHeaders],
      exposeHeaders: [...rule.exposeHeaders],
      maxAgeSeconds: rule.maxAgeSeconds,
    },
  ];
}

/** The S3 error names that mean "this key, or this API, cannot do that". */
const REFUSAL_ERROR_NAMES = new Set([
  "AccessDenied",
  "Unauthorized",
  "NotImplemented",
]);

/** The statuses that mean the same, for an error that carries no name. */
const REFUSAL_STATUS_CODES = new Set([401, 403, 501]);

/** The HTTP status the AWS SDK attaches to an error, when it did. */
function _getStatusCodeFromError(error: object): number | undefined {
  const metadata = "$metadata" in error ? error.$metadata : undefined;
  return typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    typeof metadata.httpStatusCode === "number"
    ? metadata.httpStatusCode
    : undefined;
}

/**
 * Whether a CORS read or write failed because the application key, or
 * Backblaze's S3 compatibility layer, will not do it, as opposed to the
 * network or the bucket being wrong. Only that case has a console fallback
 * on the read; the write has one for any Backblaze error
 * (`isBackblazeError`).
 *
 * @param error Whatever the AWS SDK threw.
 */
export function isAccessOrUnsupportedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  const statusCode = _getStatusCodeFromError(error);
  return (
    REFUSAL_ERROR_NAMES.has(name) ||
    (statusCode !== undefined && REFUSAL_STATUS_CODES.has(statusCode))
  );
}

/**
 * Whether an error is Backblaze (or the SDK on its behalf) answering, as
 * opposed to a bug in this script: it carries an HTTP status, or is one of the
 * refusal names. A network failure carries neither and is not one.
 *
 * Every such error from the write has the hand-entry instructions, whatever
 * its name, because the write may be refused for a reason that has nothing to
 * do with the key (a header Backblaze does not accept, say).
 *
 * @param error Whatever the AWS SDK threw.
 */
export function isBackblazeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (
    isAccessOrUnsupportedError(error) ||
    _getStatusCodeFromError(error) !== undefined
  );
}

/**
 * What Backblaze actually answered, raw: the error's name, its message and
 * its HTTP status. Printed beside the console fallback so a refusal is never
 * taken for a permissions problem on the strength of its classification
 * alone: Backblaze may refuse the request itself (a header it does not
 * accept, say) while the key is fine.
 *
 * @param error Whatever the AWS SDK threw.
 */
export function backblazeErrorSummary(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const name = "name" in error ? String(error.name) : "Unknown";
  const message = "message" in error ? String(error.message) : "(no message)";
  const statusCode = _getStatusCodeFromError(error);
  const status = statusCode === undefined ? "" : ` (HTTP ${statusCode})`;
  return `${name}: ${message}${status}`;
}

/**
 * What to run by hand when the rules cannot be read or written through the S3
 * API.
 *
 * It leads with the B2 command-line tool, because the web console's CORS
 * settings offer only presets and none can express this rule, signed in with
 * a key that may write bucket settings, which the instance's own key may not.
 * It says plainly that `--cors-rules` replaces every rule on the bucket, because this is
 * printed exactly when the bucket's current rules are unknown, and it leaves
 * the bucket type argument out so the command cannot change it.
 *
 * @param options.bucket The bucket from `B2_BUCKET`.
 * @param options.rule From `makeBucketCorsRuleFromOrigins`.
 */
export function backblazeConsoleInstructions(options: {
  bucket: string;
  rule: Readonly<BucketCorsRule>;
}): string {
  const backblazeRules = makeBackblazeCorsRulesFromRule(options.rule);
  return [
    "Backblaze refused the request to read or write the bucket's CORS rules.",
    "Set them with the B2 command-line tool instead. The web console's CORS",
    "settings offer only presets, and none of them can express this rule (PUT",
    "with ETag exposed).",
    "",
    "The tool must be signed in with a key allowed to write bucket settings (the",
    "`writeBuckets` capability, which your master key has). The key Memory",
    "Shoebox uses may only reach the bucket's files, which is likely why this",
    "failed. Sign in first:",
    "",
    "  b2 account authorize",
    "",
    "`--cors-rules` REPLACES every CORS rule on the bucket. First read what the",
    "bucket holds now:",
    "",
    `  b2 bucket get ${options.bucket}`,
    "",
    'Add each entry of its "corsRules" to the array in this command, or those',
    "rules are lost, then run it:",
    "",
    `  b2 bucket update --cors-rules '${JSON.stringify(backblazeRules)}' ${options.bucket}`,
    "",
    "The rule Memory Shoebox needs, in Backblaze's own CORS format:",
    "",
    JSON.stringify(backblazeRules, null, 2),
    "",
    "In words:",
    "",
    `  Bucket:      ${options.bucket}`,
    `  Origins:     ${options.rule.allowedOrigins.join(", ")}`,
    "  Operations:  s3_put, s3_get, s3_head",
    "  Headers:     content-type",
    "  Expose:      ETag (multipart uploads cannot finish without it)",
    `  Max age:     ${options.rule.maxAgeSeconds} seconds`,
    "",
  ].join("\n");
}

/**
 * The bucket's rules, or the refusal when Backblaze will not answer the read.
 * Anything that is not a refusal is thrown.
 */
async function _readCurrentRules(
  b2: B2Client,
): Promise<{ rules: BucketCorsRule[] } | { refusal: unknown }> {
  try {
    return { rules: await b2.getBucketCors() };
  } catch (error: unknown) {
    if (isAccessOrUnsupportedError(error)) {
      return { refusal: error };
    }
    throw error;
  }
}

/**
 * Prints Backblaze's actual error, then the console fallback, and marks the
 * run failed.
 */
function _printConsoleFallback(options: {
  bucket: string;
  rule: Readonly<BucketCorsRule>;
  refusal: unknown;
}): void {
  process.stderr.write(
    `Backblaze answered: ${backblazeErrorSummary(options.refusal)}\n\n`,
  );
  process.stderr.write(backblazeConsoleInstructions(options));
  process.exitCode = 1;
}

/** Prints what the bucket holds beside what Memory Shoebox needs. */
function _printRules(options: {
  bucket: string;
  currentRules: readonly BucketCorsRule[];
  neededRule: Readonly<BucketCorsRule>;
}): void {
  process.stdout.write(
    [
      `Current CORS rules on ${options.bucket}:`,
      JSON.stringify(options.currentRules, null, 2),
      "",
      "What Memory Shoebox needs:",
      JSON.stringify([options.neededRule], null, 2),
      "",
      "",
    ].join("\n"),
  );
}

/**
 * Writes the bucket's existing rules plus the needed one. Existing rules are
 * kept because `PutBucketCors` replaces the whole set.
 *
 * Any error Backblaze answers the write with prints that error raw and the
 * hand-entry instructions, and fails the run. Anything that is not Backblaze
 * answering is a bug and propagates.
 */
export async function applyBucketCorsRules(options: {
  b2: B2Client;
  bucket: string;
  currentRules: readonly BucketCorsRule[];
  neededRule: BucketCorsRule;
}): Promise<void> {
  try {
    await options.b2.putBucketCors({
      rules: [...options.currentRules, options.neededRule],
    });
    process.stdout.write("Written.\n");
  } catch (error: unknown) {
    if (!isBackblazeError(error)) {
      throw error;
    }
    _printConsoleFallback({
      bucket: options.bucket,
      rule: options.neededRule,
      refusal: error,
    });
  }
}

/**
 * Reports the current rules against the needed one and, with `--apply`,
 * writes what is missing. Without `--apply` it writes nothing.
 */
async function _reportAndApply(options: {
  b2: B2Client;
  bucket: string;
  neededRule: BucketCorsRule;
  isApplying: boolean;
}): Promise<void> {
  const reading = await _readCurrentRules(options.b2);
  if ("refusal" in reading) {
    _printConsoleFallback({
      bucket: options.bucket,
      rule: options.neededRule,
      refusal: reading.refusal,
    });
    return;
  }
  const currentRules = reading.rules;
  _printRules({ ...options, currentRules });
  const uncoveredOrigins = getUncoveredOriginsFromRules({
    currentRules,
    neededRule: options.neededRule,
  });
  if (uncoveredOrigins.length === 0) {
    process.stdout.write("The bucket already allows every upload origin.\n");
    return;
  }
  process.stdout.write(`Not yet allowed: ${uncoveredOrigins.join(", ")}\n`);
  if (!options.isApplying) {
    process.stdout.write("Run `pnpm b2:cors --apply` to write them.\n");
    return;
  }
  await applyBucketCorsRules({ ...options, currentRules });
}

/**
 * Runs the script when it is executed rather than imported.
 *
 * Loads the configuration exactly as the server does (`getConfig` from the
 * same environment file, then the catalog opened and migrated as
 * `src/index.ts` opens it), reads `public.base_url`, and talks to the bucket
 * that configuration names.
 */
async function _main(): Promise<void> {
  const cliArguments = getBucketCorsArgumentsFromArgv(process.argv.slice(2));
  if (cliArguments === undefined) {
    process.stderr.write(`${BUCKET_CORS_USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const config = getConfig();
  const database = createDatabase(config.databasePath);
  await migrateToLatest(database);
  const settings = await readInstanceSettings({
    database,
    keys: ["public.base_url"],
  });
  await database.destroy();

  const origins = getCorsOriginsFromBaseUrl({
    baseUrl: settings["public.base_url"] ?? undefined,
    isKnownNonProduction: config.isKnownNonProduction,
  });
  if (origins.length === 0) {
    process.stderr.write(
      "public.base_url is not set, so there is no origin to allow yet.\n",
    );
    process.exitCode = 1;
    return;
  }
  await _reportAndApply({
    b2: createB2Client(config.b2),
    bucket: config.b2.bucket,
    neededRule: makeBucketCorsRuleFromOrigins(origins),
    isApplying: cliArguments.isApplying,
  });
}

// Only run when invoked directly (`pnpm b2:cors`), not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
