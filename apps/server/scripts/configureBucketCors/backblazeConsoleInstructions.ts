import { type BucketCorsRule } from "../../src/b2/createB2Client/createB2Client.types.ts";

import { makeBackblazeCorsRulesFromRule } from "./makeBackblazeCorsRulesFromRule.ts";

/**
 * What to run by hand when the rules cannot be read or written through the S3
 * API.
 *
 * It leads with the B2 command-line tool, because the web console's CORS
 * settings offer only presets and none can express this rule, signed in with a
 * key that may write bucket settings, which the instance's own key may not. It
 * says plainly that `--cors-rules` replaces every rule on the bucket, because
 * this is printed exactly when the bucket's current rules are unknown, and it
 * leaves the bucket type argument out so the command cannot change it.
 *
 * @param options.bucket The bucket from `B2_BUCKET`.
 * @param options.rule From `makeBucketCorsRuleFromOrigins`.
 */
export function backblazeConsoleInstructions(
  options: Readonly<{
    bucket: string;
    rule: Readonly<BucketCorsRule>;
  }>,
): string {
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
