import { describe, expect, it } from "vitest";
import {
  emailCommonSchema,
  OUTBOUND_EMAIL_KINDS,
  signInCodeEmailPayloadSchema,
} from "../src/email.ts";

describe("OUTBOUND_EMAIL_KINDS", () => {
  it("holds the seven kinds the schema's CHECK constraint allows", () => {
    expect([...OUTBOUND_EMAIL_KINDS]).toEqual([
      "sign_in_code",
      "invitation",
      "upload_session",
      "comment",
      "removal_request",
      "removal_reminder",
      "removal_resolved",
    ]);
  });
});

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
});

describe("signInCodeEmailPayloadSchema", () => {
  it("requires preferencesUrl to be null, because this kind has no switch to offer", () => {
    const common = {
      shoeboxName: "My Shoebox",
      baseUrl: "https://shoebox.example",
      timezone: "Europe/Madrid",
      toDisplayName: null,
    };

    expect(
      signInCodeEmailPayloadSchema.safeParse({
        ...common,
        preferencesUrl: null,
        code: "410233",
        expiresAt: "2026-09-27T10:10:00.000Z",
        expiresInMinutes: 10,
      }).success,
    ).toBe(true);

    expect(
      signInCodeEmailPayloadSchema.safeParse({
        ...common,
        preferencesUrl: "https://shoebox.example/account",
        code: "410233",
        expiresAt: "2026-09-27T10:10:00.000Z",
        expiresInMinutes: 10,
      }).success,
    ).toBe(false);
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
