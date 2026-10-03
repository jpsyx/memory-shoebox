import { startStubBucket } from "./clientTestHelpers.ts";

import { describe, expect, it } from "vitest";

import { createB2Client } from "../../../../src/b2/createB2Client/createB2Client.ts";

import { createTestConfig } from "../../../helpers/createTestConfig.ts";

describe("the bucket's CORS rules, under the key prefix", () => {
  it("stay bucket-wide: no prefix reaches them", async () => {
    const bucket = await startStubBucket({
      answer: () => {
        return { status: 200, headers: { "content-type": "application/xml" } };
      },
    });

    await bucket.client.putBucketCors({ rules: [] });

    expect(new URL(bucket.requests[0]?.url ?? "", "http://x").pathname).toBe(
      "/memory-shoebox-media/",
    );
    await bucket.close();
  });
});

describe("createB2Client, given a key prefix that could write at the root", () => {
  it.each([
    ["empty", ""],
    ["a leading slash", "/test"],
    ["a trailing slash", "test/"],
    ["an empty segment", "shoebox//test"],
    ["a parent segment", "shoebox/../test"],
    ["uppercase letters", "Test"],
  ])("refuses a hand-built config whose prefix is %s", (_label, keyPrefix) => {
    const config = createTestConfig().b2;

    expect(() => {
      return createB2Client({ ...config, keyPrefix });
    }).toThrow(/key prefix/u);
  });
});
