import { type BucketCorsRule } from "../../../src/b2/createB2Client/createB2Client.types.ts";

import { backblazeErrorSummary } from "../bucketCorsErrorHelpers.ts";

import { backblazeConsoleInstructions } from "../backblazeConsoleInstructions.ts";

/**
 * Prints Backblaze's actual error, then the console fallback, and marks the
 * run failed.
 */
export function printConsoleFallback(
  options: Readonly<{
    bucket: string;
    rule: Readonly<BucketCorsRule>;
    refusal: unknown;
  }>,
): void {
  process.stderr.write(
    `Backblaze answered: ${backblazeErrorSummary(options.refusal)}\n\n`,
  );
  process.stderr.write(backblazeConsoleInstructions(options));
  process.exitCode = 1;
}
