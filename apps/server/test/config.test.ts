import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.ts";

/** A complete set of environment variables, used as the base for each case. */
function validEnv(): Record<string, string | undefined> {
  return {
    SESSION_SECRET: "a".repeat(32),
    B2_KEY_ID: "key-id",
    B2_APPLICATION_KEY: "application-key",
    B2_BUCKET: "famgram-media",
    B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    B2_REGION: "us-west-004",
  };
}

describe("parseConfig", () => {
  it("parses a complete environment", () => {
    const config = parseConfig(validEnv());

    expect(config.b2).toEqual({
      keyId: "key-id",
      applicationKey: "application-key",
      bucket: "famgram-media",
      endpoint: "https://s3.us-west-004.backblazeb2.com",
      region: "us-west-004",
      thumbnailPrefix: ".famgram-thumbnails",
    });
    expect(config.sessionSecret).toBe("a".repeat(32));
  });

  it("applies defaults for every optional variable", () => {
    const config = parseConfig(validEnv());

    expect(config.port).toBe(8080);
    expect(config.host).toBe("0.0.0.0");
    expect(config.databasePath).toBe("./data/famgram.db");
    expect(config.isProduction).toBe(false);
  });

  it("coerces PORT to a number", () => {
    const config = parseConfig({ ...validEnv(), PORT: "3000" });

    expect(config.port).toBe(3000);
  });

  it("marks the config as production when NODE_ENV says so", () => {
    const config = parseConfig({ ...validEnv(), NODE_ENV: "production" });

    expect(config.isProduction).toBe(true);
  });

  it("strips a trailing slash from the thumbnail prefix", () => {
    const config = parseConfig({
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
      return parseConfig(env);
    }).toThrow(/B2_BUCKET[\s\S]*SESSION_SECRET|SESSION_SECRET[\s\S]*B2_BUCKET/);
  });

  it("rejects a session secret shorter than 32 characters", () => {
    expect(() => {
      return parseConfig({ ...validEnv(), SESSION_SECRET: "too-short" });
    }).toThrow(/SESSION_SECRET/);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => {
      return parseConfig({ ...validEnv(), PORT: "not-a-number" });
    }).toThrow(/PORT/);
  });
});
