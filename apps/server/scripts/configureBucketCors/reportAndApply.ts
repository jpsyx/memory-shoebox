import {
  type B2Client,
  type BucketCorsRule,
} from "../../src/b2/createB2Client/createB2Client.types.ts";

import { isAccessOrUnsupportedError } from "./bucketCorsErrorHelpers.ts";

import type { ReportAndApplyOptions } from "./printConsoleFallback/printConsoleFallback.types.ts";

import { getUncoveredOriginsFromRules } from "./getUncoveredOriginsFromRules.ts";

import { applyBucketCorsRules } from "./applyBucketCorsRules.ts";

import { printConsoleFallback } from "./printConsoleFallback/printConsoleFallback.ts";

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
 * Reports the current rules against the needed one and, with `--apply`,
 * writes what is missing. Without `--apply` it writes nothing.
 */
export async function reportAndApply(
  options: ReportAndApplyOptions,
): Promise<void> {
  const reading = await _readCurrentRules(options.b2);
  if ("refusal" in reading) {
    printConsoleFallback({
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
