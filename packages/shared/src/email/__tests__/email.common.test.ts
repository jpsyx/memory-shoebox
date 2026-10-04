import {
  emailCommonSchema,
  signInCodeEmailPayloadSchema,
  uploadSessionEmailPayloadSchema,
} from "../../index.ts";
import { describe, expect, it } from "vitest";

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
  // enqueueEmail sets the sign-in message's null preferences URL. This suite
  // verifies that the payload schema accepts it.
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

  it("rejects a first day after the busiest day", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-15",
        lastCapturedOn: "2026-09-16",
      }).success,
    ).toBe(false);
  });

  it("rejects a busiest day after the last day", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-10",
        lastCapturedOn: "2026-09-13",
      }).success,
    ).toBe(false);
  });

  it("accepts a busiest day inside a span, and on either end of it", () => {
    ["2026-09-10", "2026-09-12", "2026-09-14"].forEach((capturedOn) => {
      expect(
        uploadSessionEmailPayloadSchema.safeParse({
          ...PAYLOAD,
          visibleDayCount: 3,
          capturedOn,
          firstCapturedOn: "2026-09-10",
          lastCapturedOn: "2026-09-14",
        }).success,
      ).toBe(true);
    });
  });

  it("rejects one day that spans two, because the days disagree", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 1,
        firstCapturedOn: "2026-09-13",
      }).success,
    ).toBe(false);
  });

  it("rejects several days that start and end on the same one", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleDayCount: 3,
      }).success,
    ).toBe(false);
  });

  it("rejects more days than photographs", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleItemCount: 2,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-12",
      }).success,
    ).toBe(false);
  });

  it("accepts exactly one photograph per day", () => {
    expect(
      uploadSessionEmailPayloadSchema.safeParse({
        ...PAYLOAD,
        visibleItemCount: 3,
        visibleDayCount: 3,
        firstCapturedOn: "2026-09-12",
      }).success,
    ).toBe(true);
  });
});
