import { fileURLToPath } from "node:url";

import { createB2Client } from "../../src/b2/createB2Client/createB2Client.ts";

import { getConfig } from "../../src/configHelpers.ts";

import { createDatabase } from "../../src/db/client.ts";

import { migrateToLatest } from "../../src/db/migrate.ts";

import { readInstanceSettings } from "../../src/settings/readInstanceSettings.ts";

import { BUCKET_CORS_USAGE } from "./printConsoleFallback/printConsoleFallback.constants.ts";

import { getBucketCorsArgumentsFromArgv } from "./getBucketCorsArgumentsFromArgv.ts";

import { getCorsOriginsFromBaseUrl } from "./getCorsOriginsFromBaseUrl.ts";

import { makeBucketCorsRuleFromOrigins } from "./makeBucketCorsRuleFromOrigins.ts";

import { reportAndApply } from "./reportAndApply.ts";

/**
 * Runs the bucket CORS script when executed directly.
 *
 * Uses the server environment and catalog settings to configure the selected
 * bucket for public.base_url.
 */
async function _main(): Promise<void> {
  // Load configuration through getConfig, open and migrate the catalog as the
  // server does, then read public.base_url for the configured bucket.

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
  await reportAndApply({
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
