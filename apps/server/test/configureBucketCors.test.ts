import { describe, expect, it } from "vitest";
import {
  backblazeConsoleInstructions,
  backblazeErrorSummary,
  getBucketCorsArgumentsFromArgv,
  getCorsOriginsFromBaseUrl,
  getUncoveredOriginsFromRules,
  isAccessOrUnsupportedError,
  makeBackblazeCorsRulesFromRule,
  makeBucketCorsRuleFromOrigins,
} from "../scripts/configureBucketCors.ts";

const NEEDED = makeBucketCorsRuleFromOrigins([
  "https://shoebox.example.com",
  "http://localhost:5173",
]);

describe("getBucketCorsArgumentsFromArgv", () => {
  it("reports by default, applies with --apply, and refuses anything else", () => {
    expect(getBucketCorsArgumentsFromArgv([])).toEqual({ isApplying: false });
    expect(getBucketCorsArgumentsFromArgv(["--apply"])).toEqual({
      isApplying: true,
    });
    expect(getBucketCorsArgumentsFromArgv(["--force"])).toBeUndefined();
  });
});

describe("getCorsOriginsFromBaseUrl", () => {
  it("takes the instance's origin, not its path", () => {
    expect(
      getCorsOriginsFromBaseUrl({
        baseUrl: "https://shoebox.example.com/",
        isKnownNonProduction: false,
      }),
    ).toEqual(["https://shoebox.example.com"]);
  });

  it("adds the Vite origin only outside production", () => {
    expect(
      getCorsOriginsFromBaseUrl({
        baseUrl: "https://shoebox.example.com",
        isKnownNonProduction: true,
      }),
    ).toEqual(["https://shoebox.example.com", "http://localhost:5173"]);
  });

  it("names each origin once when the base URL is the Vite origin", () => {
    expect(
      getCorsOriginsFromBaseUrl({
        baseUrl: "http://localhost:5173",
        isKnownNonProduction: true,
      }),
    ).toEqual(["http://localhost:5173"]);
  });

  it("has nothing to allow in production while public.base_url is unset", () => {
    expect(
      getCorsOriginsFromBaseUrl({
        baseUrl: undefined,
        isKnownNonProduction: false,
      }),
    ).toEqual([]);
  });
});

describe("makeBucketCorsRuleFromOrigins", () => {
  it("allows PUT, GET and HEAD with content-type, and exposes ETag", () => {
    expect(
      makeBucketCorsRuleFromOrigins(["https://shoebox.example.com"]),
    ).toEqual({
      allowedOrigins: ["https://shoebox.example.com"],
      allowedMethods: ["PUT", "GET", "HEAD"],
      allowedHeaders: ["content-type"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    });
  });
});

describe("getUncoveredOriginsFromRules", () => {
  it("finds every origin uncovered on a bucket with no rules", () => {
    expect(
      getUncoveredOriginsFromRules({ currentRules: [], neededRule: NEEDED }),
    ).toEqual(["https://shoebox.example.com", "http://localhost:5173"]);
  });

  it("finds nothing to do once the needed rule is there, whatever the case", () => {
    expect(
      getUncoveredOriginsFromRules({
        currentRules: [
          {
            ...NEEDED,
            allowedMethods: ["get", "head", "put"],
            exposeHeaders: ["etag"],
          },
        ],
        neededRule: NEEDED,
      }),
    ).toEqual([]);
  });

  it("does not count a rule that allows the origin but hides ETag", () => {
    expect(
      getUncoveredOriginsFromRules({
        currentRules: [{ ...NEEDED, exposeHeaders: [] }],
        neededRule: NEEDED,
      }),
    ).toEqual(["https://shoebox.example.com", "http://localhost:5173"]);
  });

  it("counts a wildcard origin that does everything else", () => {
    expect(
      getUncoveredOriginsFromRules({
        currentRules: [{ ...NEEDED, allowedOrigins: ["*"] }],
        neededRule: NEEDED,
      }),
    ).toEqual([]);
  });

  it("does not count two rules that each do half", () => {
    expect(
      getUncoveredOriginsFromRules({
        currentRules: [
          { ...NEEDED, allowedMethods: ["GET", "HEAD"] },
          { ...NEEDED, allowedMethods: ["PUT"] },
        ],
        neededRule: NEEDED,
      }),
    ).toEqual(["https://shoebox.example.com", "http://localhost:5173"]);
  });
});

describe("the console fallback", () => {
  it("speaks Backblaze's native CORS format", () => {
    expect(makeBackblazeCorsRulesFromRule(NEEDED)).toEqual([
      {
        corsRuleName: "memory-shoebox-uploads",
        allowedOrigins: [
          "https://shoebox.example.com",
          "http://localhost:5173",
        ],
        allowedOperations: ["s3_put", "s3_get", "s3_head"],
        allowedHeaders: ["content-type"],
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
    ]);
  });

  it("names the bucket and carries the rules to paste", () => {
    const instructions = backblazeConsoleInstructions({
      bucket: "family-shoebox",
      rule: NEEDED,
    });

    expect(instructions).toContain("Bucket:      family-shoebox");
    expect(instructions).toContain('"corsRuleName": "memory-shoebox-uploads"');
    expect(instructions).toContain('"exposeHeaders": [\n      "ETag"\n    ]');
  });

  it("falls back on a refusal, and only on a refusal", () => {
    expect(isAccessOrUnsupportedError({ name: "AccessDenied" })).toBe(true);
    expect(isAccessOrUnsupportedError({ name: "NotImplemented" })).toBe(true);
    expect(
      isAccessOrUnsupportedError({
        name: "Unknown",
        $metadata: { httpStatusCode: 403 },
      }),
    ).toBe(true);
    expect(isAccessOrUnsupportedError(new Error("socket hang up"))).toBe(false);
    expect(isAccessOrUnsupportedError("AccessDenied")).toBe(false);
  });

  it("shows Backblaze's own error, never just a guess at the cause", () => {
    expect(
      backblazeErrorSummary({
        name: "InvalidRequest",
        message: "Content-MD5 or x-amz-checksum header is required",
        $metadata: { httpStatusCode: 400 },
      }),
    ).toBe(
      "InvalidRequest: Content-MD5 or x-amz-checksum header is required (HTTP 400)",
    );
    expect(backblazeErrorSummary(new Error("socket hang up"))).toBe(
      "Error: socket hang up",
    );
    expect(backblazeErrorSummary("boom")).toBe("boom");
  });
});
