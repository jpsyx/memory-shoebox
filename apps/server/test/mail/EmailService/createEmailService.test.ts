import { describe, expect, it } from "vitest";
import {
  createEmailService,
  getEmailServiceKind,
} from "../../../src/mail/EmailService/createEmailService.ts";
import { createTestConfig } from "../../helpers/createTestConfig.ts";

describe("getEmailServiceKind", () => {
  it("sends nothing when nothing is configured", () => {
    expect(getEmailServiceKind(createTestConfig())).toBe("none");
  });

  it("uses the provider when a key is set", () => {
    const config = createTestConfig({ RESEND_API_KEY: "re_test" });

    expect(getEmailServiceKind(config)).toBe("resend");
  });

  it("fakes when asked to, outside production", () => {
    const config = createTestConfig({
      ENABLE_FAKE_EMAIL: "true",
      RESEND_API_KEY: "re_test",
    });

    expect(getEmailServiceKind(config)).toBe("fake");
  });

  it("fakes even with no provider key, since nothing is sent", () => {
    const config = createTestConfig({ ENABLE_FAKE_EMAIL: "true" });

    expect(getEmailServiceKind(config)).toBe("fake");
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["capitalised", "Production"],
    ["abbreviated", "prod"],
    ["staging", "staging"],
    ["padded", " development "],
  ])(
    "refuses to fake when NODE_ENV is %s, because it cannot tell",
    (_label, nodeEnv) => {
      // The gate fails closed on purpose. Every value here leaves
      // `isProduction` false, so a gate written as `!isProduction` would fake
      // on all of them, and each is something a self-hoster could plausibly
      // end up with: a systemd unit that never set the variable, a PaaS that
      // writes an empty string for a blank field, a hand-written compose file.
      // The cost of guessing wrong is an instance that looks healthy while
      // every sign-in code goes to a file nobody opens.
      const config = createTestConfig({
        NODE_ENV: nodeEnv,
        ENABLE_FAKE_EMAIL: "true",
        RESEND_API_KEY: "re_test",
      });

      expect(getEmailServiceKind(config)).toBe("resend");
    },
  );

  it("refuses to fake in production, however the flag is set", () => {
    const config = createTestConfig({
      NODE_ENV: "production",
      ENABLE_FAKE_EMAIL: "true",
      RESEND_API_KEY: "re_test",
    });

    expect(getEmailServiceKind(config)).toBe("resend");
  });

  it("sends nothing in production with the flag on and no key", () => {
    const config = createTestConfig({
      NODE_ENV: "production",
      ENABLE_FAKE_EMAIL: "true",
    });

    expect(getEmailServiceKind(config)).toBe("none");
  });
});

describe("createEmailService", () => {
  it("builds nothing when this instance sends nothing", () => {
    expect(createEmailService({ config: createTestConfig() })).toBeUndefined();
  });

  it("builds a service whenever the kind is not none", () => {
    const resend = createEmailService({
      config: createTestConfig({ RESEND_API_KEY: "re_test" }),
    });
    const fake = createEmailService({
      config: createTestConfig({ ENABLE_FAKE_EMAIL: "true" }),
      // Never written to: building a service touches no disk, and nothing
      // here sends.
      fakeOutputDirectory: "/tmp/memory-shoebox-emails-never-written",
    });

    expect(resend).toBeDefined();
    expect(fake).toBeDefined();
  });
});
