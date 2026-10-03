import { type BucketCorsRule } from "../../src/b2/createB2Client/createB2Client.types.ts";

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
export function getUncoveredOriginsFromRules(
  options: Readonly<{
    currentRules: readonly BucketCorsRule[];
    neededRule: Readonly<BucketCorsRule>;
  }>,
): string[] {
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
