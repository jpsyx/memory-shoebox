import { type BucketCorsRule } from "../../src/b2/createB2Client/createB2Client.types.ts";

import { CORS_MAX_AGE_SECONDS } from "./printConsoleFallback/printConsoleFallback.constants.ts";

/**
 * The one rule direct uploads need.
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
