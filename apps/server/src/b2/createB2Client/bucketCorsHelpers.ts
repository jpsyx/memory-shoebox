import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3ServiceException,
  type CORSRule,
} from "@aws-sdk/client-s3";

import type { BucketCorsRule, BucketHandle } from "./createB2Client.types.ts";

/** S3's `CORSRule`, whose lists are all optional, as a `BucketCorsRule`. */
function makeBucketCorsRuleFromS3Rule(
  rule: Readonly<CORSRule>,
): BucketCorsRule {
  return {
    allowedOrigins: [...(rule.AllowedOrigins ?? [])],
    allowedMethods: [...(rule.AllowedMethods ?? [])],
    allowedHeaders: [...(rule.AllowedHeaders ?? [])],
    exposeHeaders: [...(rule.ExposeHeaders ?? [])],
    maxAgeSeconds: rule.MaxAgeSeconds ?? 0,
  };
}

/** A `BucketCorsRule` in the shape `PutBucketCors` sends. */
function makeS3RuleFromBucketCorsRule(
  rule: Readonly<BucketCorsRule>,
): CORSRule {
  return {
    AllowedOrigins: [...rule.allowedOrigins],
    AllowedMethods: [...rule.allowedMethods],
    AllowedHeaders: [...rule.allowedHeaders],
    ExposeHeaders: [...rule.exposeHeaders],
    MaxAgeSeconds: rule.maxAgeSeconds,
  };
}

/**
 * Whether the SDK reports that the bucket has no CORS configuration.
 *
 * Backblaze uses NoSuchCorsConfiguration and AWS uses NoSuchCORSConfiguration.
 * Match both spellings; an AWS-only comparison rejects a valid no-rule
 * Backblaze response. Accept the exception name or Code field. NoSuchBucket is
 * a different error.
 */
function _hasNoCorsConfiguration(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }
  const codes = [
    error.name,
    "Code" in error && typeof error.Code === "string" ? error.Code : "",
  ];
  return codes.some((code) => {
    return code.toLowerCase() === "nosuchcorsconfiguration";
  });
}

/** The bucket's rules. A bucket that has none answers 404, which is `[]`. */
export async function getBucketCorsFromHandle(
  handle: BucketHandle,
): Promise<BucketCorsRule[]> {
  try {
    const output = await handle.s3.send(
      new GetBucketCorsCommand({ Bucket: handle.bucket }),
    );
    return (output.CORSRules ?? []).map(makeBucketCorsRuleFromS3Rule);
  } catch (error) {
    if (_hasNoCorsConfiguration(error)) {
      return [];
    }
    throw error;
  }
}

/** Replaces the bucket's rules with these. */
export async function putBucketCors(
  options: Readonly<{
    handle: BucketHandle;
    rules: readonly BucketCorsRule[];
  }>,
): Promise<void> {
  await options.handle.s3.send(
    new PutBucketCorsCommand({
      Bucket: options.handle.bucket,
      CORSConfiguration: {
        CORSRules: options.rules.map(makeS3RuleFromBucketCorsRule),
      },
    }),
  );
}
