import { describe, expect, it } from "vitest";
import {
  emailCommonSchema,
  signInCodeEmailPayloadSchema,
  uploadSessionEmailPayloadSchema,
} from "../src/email.ts";

describe("emailCommonSchema", () => {
  it("accepts a resolved common block", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: "Abuela Rosa",
      preferencesUrl: "https://shoebox.example/account",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a relative base URL, because an email can only carry an absolute one", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "/account",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a resolvable IANA zone and rejects one Intl cannot resolve", () => {
    const common = {
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      toDisplayName: null,
      preferencesUrl: null,
    };

    expect(
      emailCommonSchema.safeParse({ ...common, timezone: "Europe/Madrid" })
        .success,
    ).toBe(true);

    expect(
      emailCommonSchema.safeParse({ ...common, timezone: "Not/AZone" }).success,
    ).toBe(false);
  });

  it("rejects a whitespace Shoebox name, which renders as an empty masthead", () => {
    const parsed = emailCommonSchema.safeParse({
      shoeboxName: "   ",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("signInCodeEmailPayloadSchema", () => {
  // The schema no longer narrows `preferencesUrl` to `z.null()`. That rule is
  // `enqueueEmail`'s, because only it can decide the value, and
  // `apps/server/test/mail/enqueue.test.ts` asserts the null it writes for
  // this kind. What this file still owns is that the null parses.
  it("accepts the null preferencesUrl that this kind always carries", () => {
    expect(
      signInCodeEmailPayloadSchema.safeParse({
        shoeboxName: "My Shoebox",
        baseUrl: "https://shoebox.example",
        timezone: "Europe/Madrid",
        toDisplayName: null,
        preferencesUrl: null,
        code: "410233",
        expiresAt: "2026-09-27T10:10:00.000Z",
        expiresInMinutes: 10,
      }).success,
    ).toBe(true);
  });

  it("rejects a code that is not six digits", () => {
    const parsed = signInCodeEmailPayloadSchema.safeParse({
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
      preferencesUrl: null,
      code: "41023",
      expiresAt: "2026-09-27T10:10:00.000Z",
      expiresInMinutes: 10,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("uploadSessionEmailPayloadSchema", () => {
  const PAYLOAD = {
    shoeboxName: "My Shoebox",
    baseUrl: "https://shoebox.example",
    timezone: "Europe/Madrid",
    toDisplayName: "Abuela Rosa",
    preferencesUrl: "https://shoebox.example/account",
    uploaderDisplayName: "Papá",
    visibleItemCount: 210,
    capturedOn: "2026-09-14",
    visibleDayCount: 1,
    firstCapturedOn: "2026-09-14",
    lastCapturedOn: "2026-09-14",
    dayUrl: "https://shoebox.example/?at=2026-09-14",
    milestoneName: "Mateo is born",
  };

  it("accepts one recipient's own figures", () => {
    expect(uploadSessionEmailPayloadSchema.safeParse(PAYLOAD).success).toBe(
      true,
    );
  });

  it("rejects a count of zero, because nobody is told about nothing", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleItemCount: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a formatted day, because the renderer formats it", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        capturedOn: "14 September 2026",
      }).success,
    ).toBe(false);
  });
});
