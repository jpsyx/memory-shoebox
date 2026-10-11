import type { BucketCorsRule } from "../../src/b2/createB2Client/createB2Client.types.ts";
import { isBackblazeError } from "./bucketCorsErrorHelpers.ts";

import type { ApplyBucketCorsRulesOptions } from "./printConsoleFallback/printConsoleFallback.types.ts";

import { printConsoleFallback } from "./printConsoleFallback/printConsoleFallback.ts";

/**
 * Writes the bucket's existing rules plus the needed one. Existing rules are
 * kept because `PutBucketCors` replaces the whole set.
 *
 * Any error Backblaze answers the write with prints that error raw and the
 * hand-entry instructions, and fails the run. Anything that is not Backblaze
 * answering is a bug and propagates.
 */
export async function applyBucketCorsRules(
  options: Readonly<Omit<ApplyBucketCorsRulesOptions, "currentRules">> &
    Readonly<{ currentRules: readonly BucketCorsRule[] }>,
): Promise<void> {
  try {
    await options.b2.putBucketCors({
      rules: [...options.currentRules, options.neededRule],
    });
    process.stdout.write(
      `CORS updated on ${options.bucket}. Uploads are now allowed from: ${options.neededRule.allowedOrigins.join(", ")}\nExisting CORS rules were preserved.\n`,
    );
  } catch (error: unknown) {
    if (!isBackblazeError(error)) {
      throw error;
    }
    printConsoleFallback({
      bucket: options.bucket,
      rule: options.neededRule,
      refusal: error,
    });
  }
}
