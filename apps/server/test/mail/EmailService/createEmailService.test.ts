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
