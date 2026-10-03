import {
  type B2Client,
  type BucketCorsRule,
} from "../../../src/b2/createB2Client/createB2Client.types.ts";

/** Inputs for applyBucketCorsRules. */
export type ApplyBucketCorsRulesOptions = {
  b2: B2Client;
  bucket: string;
  currentRules: BucketCorsRule[];
  neededRule: BucketCorsRule;
};

/** Inputs for _reportAndApply. */
export type ReportAndApplyOptions = {
  b2: B2Client;
  bucket: string;
  neededRule: BucketCorsRule;
  isApplying: boolean;
};

/** One rule in Backblaze's native CORS format, for the console fallback. */
export type BackblazeCorsRule = {
  corsRuleName: string;
  allowedOrigins: string[];
  allowedOperations: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAgeSeconds: number;
};
