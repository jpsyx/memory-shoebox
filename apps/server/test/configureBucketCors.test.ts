import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBucketCorsRules } from "../scripts/configureBucketCors/applyBucketCorsRules.ts";
import { getBucketCorsArgumentsFromArgv } from "../scripts/configureBucketCors/getBucketCorsArgumentsFromArgv.ts";
import { getCorsOriginsFromBaseUrl } from "../scripts/configureBucketCors/getCorsOriginsFromBaseUrl.ts";
import { getUncoveredOriginsFromRules } from "../scripts/configureBucketCors/getUncoveredOriginsFromRules.ts";
import { makeBucketCorsRuleFromOrigins } from "../scripts/configureBucketCors/makeBucketCorsRuleFromOrigins.ts";
import { backblazeConsoleInstructions } from "../scripts/configureBucketCors/backblazeConsoleInstructions.ts";
import {
  backblazeErrorSummary,
  isAccessOrUnsupportedError,
  isBackblazeError,
} from "../scripts/configureBucketCors/bucketCorsErrorHelpers.ts";
import { makeBackblazeCorsRulesFromRule } from "../scripts/configureBucketCors/makeBackblazeCorsRulesFromRule.ts";
import { createFakeB2Client } from "./helpers/createFakeB2Client/createFakeB2Client.ts";

const NEEDED = makeBucketCorsRuleFromOrigins([
  "https://shoebox.example.com",
  "http://localhost:38473",
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
    ).toEqual(["https://shoebox.example.com", "http://localhost:38473"]);
  });

  it("names each origin once when the base URL is the Vite origin", () => {
    expect(
      getCorsOriginsFromBaseUrl({
        baseUrl: "http://localhost:38473",
        isKnownNonProduction: true,
      }),
    ).toEqual(["http://localhost:38473"]);
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
    ).toEqual(["https://shoebox.example.com", "http://localhost:38473"]);
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
    ).toEqual(["https://shoebox.example.com", "http://localhost:38473"]);
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
    ).toEqual(["https://shoebox.example.com", "http://localhost:38473"]);
  });
});

describe("the console fallback", () => {
  it("speaks Backblaze's native CORS format", () => {
    expect(makeBackblazeCorsRulesFromRule(NEEDED)).toEqual([
      {
        corsRuleName: "memory-shoebox-uploads",
        allowedOrigins: [
          "https://shoebox.example.com",
          "http://localhost:38473",
        ],
        allowedOperations: ["s3_put", "s3_get", "s3_head"],
        allowedHeaders: ["content-type"],
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
    ]);
  });

  it("leads with the command line, which replaces rules, and says so", () => {
    const instructions = backblazeConsoleInstructions({
      bucket: "family-shoebox",
      rule: NEEDED,
    });

    expect(instructions).toContain("`--cors-rules` REPLACES every CORS rule");
    expect(instructions).toContain("b2 bucket get family-shoebox");
    expect(instructions).toContain('each entry of its "corsRules"');
    expect(instructions).toMatch(
      /\n {2}b2 bucket update --cors-rules '\[.*\]' family-shoebox\n/,
    );
    expect(instructions.indexOf("b2 bucket get")).toBeLessThan(
      instructions.indexOf("Bucket:      family-shoebox"),
    );
  });

  it("says the command needs a key allowed to write bucket settings", () => {
    const instructions = backblazeConsoleInstructions({
      bucket: "family-shoebox",
      rule: NEEDED,
    });

    expect(instructions).toContain("writeBuckets");
    expect(instructions).toContain("b2 account authorize");
    expect(instructions.indexOf("writeBuckets")).toBeLessThan(
      instructions.indexOf("b2 bucket update"),
    );
  });

  it("never changes the bucket type, and does not send anyone to custom rules", () => {
    const instructions = backblazeConsoleInstructions({
      bucket: "family-shoebox",
      rule: NEEDED,
    });

    expect(instructions).not.toContain("allPrivate");
    expect(instructions).not.toContain("allPublic");
    expect(instructions).not.toContain("custom rules");
    expect(instructions).toContain("offer only presets");
  });

  it("carries the rule to paste, in Backblaze's format", () => {
    const instructions = backblazeConsoleInstructions({
      bucket: "family-shoebox",
      rule: NEEDED,
    });

    expect(instructions).toContain('"corsRuleName": "memory-shoebox-uploads"');
    expect(instructions).toContain('"exposeHeaders": [\n      "ETag"\n    ]');
    expect(instructions).toContain("Bucket:      family-shoebox");
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

describe("isBackblazeError", () => {
  it("is Backblaze answering, whatever it said", () => {
    expect(isBackblazeError({ name: "AccessDenied" })).toBe(true);
    expect(
      isBackblazeError({
        name: "InvalidRequest",
        $metadata: { httpStatusCode: 400 },
      }),
    ).toBe(true);
    expect(
      isBackblazeError({
        name: "InternalError",
        $metadata: { httpStatusCode: 500 },
      }),
    ).toBe(true);
  });

  it("is not a bug in this script or a dead network", () => {
    expect(isBackblazeError(new Error("socket hang up"))).toBe(false);
    expect(isBackblazeError(new TypeError("x is undefined"))).toBe(false);
    expect(isBackblazeError({ name: "Error", $metadata: {} })).toBe(false);
    expect(isBackblazeError("InvalidRequest")).toBe(false);
  });
});

describe("applyBucketCorsRules", () => {
  const existing = {
    ...NEEDED,
    allowedOrigins: ["https://elsewhere.example.com"],
  };
  let stdout: string[];
  let stderr: string[];
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    previousExitCode = process.exitCode;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = previousExitCode;
  });

  it("writes the existing rules plus the needed one", async () => {
    const b2 = createFakeB2Client();

    await applyBucketCorsRules({
      b2,
      bucket: "family-shoebox",
      currentRules: [existing],
      neededRule: NEEDED,
    });

    expect(b2.corsRules).toEqual([existing, NEEDED]);
    expect(stdout.join("")).toBe("Written.\n");
    expect(process.exitCode).toBe(previousExitCode);
  });

  it("prints Backblaze's own error and the instructions for any Backblaze error", async () => {
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "putBucketCors") {
        throw Object.assign(new Error("Content-MD5 or checksum is required"), {
          name: "InvalidRequest",
          $metadata: { httpStatusCode: 400 },
        });
      }
    };

    await applyBucketCorsRules({
      b2,
      bucket: "family-shoebox",
      currentRules: [],
      neededRule: NEEDED,
    });

    const printed = stderr.join("");
    expect(printed).toContain(
      "Backblaze answered: InvalidRequest: Content-MD5 or checksum is required (HTTP 400)",
    );
    expect(printed).toContain("b2 bucket get family-shoebox");
    expect(process.exitCode).toBe(1);
  });

  it("lets anything that is not Backblaze answering propagate", async () => {
    const b2 = createFakeB2Client();
    b2.onCall = (operation) => {
      if (operation === "putBucketCors") {
        throw new Error("socket hang up");
      }
    };

    await expect(
      applyBucketCorsRules({
        b2,
        bucket: "family-shoebox",
        currentRules: [],
        neededRule: NEEDED,
      }),
    ).rejects.toThrow("socket hang up");
    expect(stderr).toEqual([]);
    expect(process.exitCode).toBe(previousExitCode);
  });
});
