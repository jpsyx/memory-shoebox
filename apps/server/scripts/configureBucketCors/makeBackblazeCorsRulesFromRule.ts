import { type BucketCorsRule } from "../../src/b2/createB2Client/createB2Client.types.ts";

import type { BackblazeCorsRule } from "./printConsoleFallback/printConsoleFallback.types.ts";

import { CORS_RULE_NAME } from "./printConsoleFallback/printConsoleFallback.constants.ts";

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
