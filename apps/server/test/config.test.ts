import { describe, expect, it } from "vitest";
import { makeConfigFromEnvironment } from "../src/configHelpers.ts";

/** A complete set of environment variables, used as the base for each case. */
function validEnv(): Record<string, string | undefined> {
  return {
    SESSION_SECRET: "a".repeat(32),
    B2_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "application-key",
    B2_BUCKET: "memory-shoebox-media",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
  };
}

describe("parseConfig", () => {
  it("parses a complete environment", () => {
    const config = makeConfigFromEnvironment(validEnv());

    expect(config.b2).toEqual({
      keyId: "key-id",
      applicationKey: "application-key",
      bucket: "memory-shoebox-media",
      endpoint: "https://s3.us-west-004.backblazeb2.com",
      region: "us-west-004",
      thumbnailPrefix: ".memory-shoebox-thumbnails",
      keyPrefix: "test",
    });
    expect(config.sessionSecret).toBe("a".repeat(32));
  });

  it("applies defaults for every optional variable", () => {
    const config = makeConfigFromEnvironment(validEnv());

    expect(config.port).toBe(8080);
    expect(config.host).toBe("0.0.0.0");
    expect(config.databasePath).toBe("./data/memory-shoebox.db");
    expect(config.isProduction).toBe(false);
  });

  it("coerces PORT to a number", () => {
    const config = makeConfigFromEnvironment({ ...validEnv(), PORT: "3000" });

    expect(config.port).toBe(3000);
  });

  it("marks the config as production when NODE_ENV says so", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      NODE_ENV: "production",
    });

    expect(config.isProduction).toBe(true);
  });

  it("strips a trailing slash from the thumbnail prefix", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      B2_THUMBNAIL_PREFIX: "thumbnails/",
    });

    expect(config.b2.thumbnailPrefix).toBe("thumbnails");
  });

  it("names every missing required variable in one error", () => {
    const env = validEnv();
    delete env["B2_BUCKET"];
    delete env["SESSION_SECRET"];

    expect(() => {
      return makeConfigFromEnvironment(env);
    }).toThrow(/B2_BUCKET[\s\S]*SESSION_SECRET|SESSION_SECRET[\s\S]*B2_BUCKET/);
  });

  it("rejects a session secret shorter than 32 characters", () => {
    expect(() => {
      return makeConfigFromEnvironment({
        ...validEnv(),
        SESSION_SECRET: "too-short",
      });
    }).toThrow(/SESSION_SECRET/);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => {
      return makeConfigFromEnvironment({ ...validEnv(), PORT: "not-a-number" });
    }).toThrow(/PORT/);
  });
});

describe("parseConfig, the B2 key prefix", () => {
  it("defaults to production when NODE_ENV is production", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      NODE_ENV: "production",
    });

    expect(config.b2.keyPrefix).toBe("production");
  });

  it.each([
    ["development", { NODE_ENV: "development" }],
    ["test", { NODE_ENV: "test" }],
    ["unset", {}],
  ])("defaults to test when NODE_ENV is %s", (_label, environment) => {
    const config = makeConfigFromEnvironment({ ...validEnv(), ...environment });

    expect(config.b2.keyPrefix).toBe("test");
  });

  it("takes B2_KEY_PREFIX over either default", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      NODE_ENV: "production",
      B2_KEY_PREFIX: "family-2026",
    });

    expect(config.b2.keyPrefix).toBe("family-2026");
  });

  it("accepts a prefix of several path segments", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      B2_KEY_PREFIX: "shoebox/test-1",
    });

    expect(config.b2.keyPrefix).toBe("shoebox/test-1");
  });

  it.each([
    ["empty", ""],
    ["a leading slash", "/test"],
    ["a trailing slash", "test/"],
    ["an empty segment", "shoebox//test"],
    ["a parent segment", "shoebox/../test"],
    ["only dots", ".."],
    ["uppercase letters", "Test"],
    ["a space", "my test"],
    ["an underscore", "my_test"],
  ])("refuses B2_KEY_PREFIX with %s, naming the variable", (_label, value) => {
    expect(() => {
      return makeConfigFromEnvironment({ ...validEnv(), B2_KEY_PREFIX: value });
    }).toThrow(/B2_KEY_PREFIX/);
  });

  it("explains the rule when it refuses an empty B2_KEY_PREFIX", () => {
    expect(() => {
      return makeConfigFromEnvironment({ ...validEnv(), B2_KEY_PREFIX: "" });
    }).toThrow(/must not be empty/);
  });
});

it("treats RESEND_API_KEY as optional, so an unconfigured instance still boots", () => {
  expect(
    makeConfigFromEnvironment({
      SESSION_SECRET: "a".repeat(32),
      B2_KEY_ID: "key-id",
      B2_APPLICATION_KEY: "application-key",
      B2_BUCKET: "bucket",
      B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
      B2_REGION: "us-west-004",
    }).resendApiKey,
  ).toBeUndefined();
});

it("reads an unfilled RESEND_API_KEY= as no key rather than a bad one", () => {
  expect(
    makeConfigFromEnvironment({ ...validEnv(), RESEND_API_KEY: "" })
      .resendApiKey,
  ).toBeUndefined();
});

it("keeps a RESEND_API_KEY that is actually set", () => {
  expect(
    makeConfigFromEnvironment({ ...validEnv(), RESEND_API_KEY: "re_test" })
      .resendApiKey,
  ).toBe("re_test");
});

describe("signInCodePepper", () => {
  it("is 32 bytes derived from the session secret", () => {
    const config = makeConfigFromEnvironment(validEnv());
    expect(config.signInCodePepper).toHaveLength(32);
  });

  it("is the same for the same secret", () => {
    const first = makeConfigFromEnvironment(validEnv());
    const second = makeConfigFromEnvironment(validEnv());
    expect(first.signInCodePepper.equals(second.signInCodePepper)).toBe(true);
  });

  it("is not the secret itself, and differs with it", () => {
    const config = makeConfigFromEnvironment(validEnv());
    const other = makeConfigFromEnvironment({
      ...validEnv(),
      SESSION_SECRET: "b".repeat(32),
    });
    expect(config.signInCodePepper.toString("utf8")).not.toBe(
      config.sessionSecret,
    );
    expect(config.signInCodePepper.equals(other.signInCodePepper)).toBe(false);
  });
});

describe("the email variables", () => {
  it("leaves fake email off when nothing says otherwise", () => {
    expect(makeConfigFromEnvironment(validEnv()).enableFakeEmail).toBe(false);
  });

  it("reads fake email as on only for the exact string", () => {
    expect(
      makeConfigFromEnvironment({ ...validEnv(), ENABLE_FAKE_EMAIL: "true" })
        .enableFakeEmail,
    ).toBe(true);
    expect(
      makeConfigFromEnvironment({ ...validEnv(), ENABLE_FAKE_EMAIL: "1" })
        .enableFakeEmail,
    ).toBe(false);
  });

  it("treats an unfilled Upstash variable as absent, not as empty", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    });

    expect(config.upstashRedisRestUrl).toBeUndefined();
    expect(config.upstashRedisRestToken).toBeUndefined();
  });

  it("reads the Upstash credentials when they are filled in", () => {
    const config = makeConfigFromEnvironment({
      ...validEnv(),
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "a-token",
    });

    expect(config.upstashRedisRestUrl).toBe("https://example.upstash.io");
    expect(config.upstashRedisRestToken).toBe("a-token");
  });
});
