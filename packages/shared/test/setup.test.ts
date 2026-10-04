import { describe, expect, it } from "vitest";
import {
  createSetupRequestSchema,
  createSetupResponseSchema,
  setupStatusResponseSchema,
  setupProgressResponseSchema,
} from "../src/index.ts";

const validSetup = {
  admin: { displayName: " Owner ", email: " OWNER@EXAMPLE.COM " },
  shoebox: { name: "Box", timezone: "UTC" },
  public: { baseUrl: "https://family.example.com" },
};

describe("setup contracts", () => {
  it("normalizes the first admin without a requested role", () => {
    expect(createSetupRequestSchema.parse(validSetup).admin.email).toBe(
      "owner@example.com",
    );
    expect(createSetupRequestSchema.parse(validSetup).admin.displayName).toBe(
      "Owner",
    );
  });
  it.each([
    { ...validSetup, role: "admin" },
    { ...validSetup, admin: { ...validSetup.admin, role: "admin" } },
    { ...validSetup, shoebox: { name: "Box", timezone: "invalid/zone" } },
    { ...validSetup, public: { baseUrl: "javascript:alert(1)" } },
    {
      ...validSetup,
      admin: { ...validSetup.admin, displayName: "x".repeat(81) },
    },
    { ...validSetup, mail: { fromAddress: "bad", fromName: "Family" } },
    {
      ...validSetup,
      mail: {
        fromAddress: null,
        fromName: null,
        domainVerifiedAt: "2026-10-04T00:00:00.000Z",
      },
    },
    { ...validSetup, shoebox: { name: " ", timezone: "UTC" } },
  ])("rejects malformed or widened setup bodies: %j", (body) => {
    expect(createSetupRequestSchema.safeParse(body).success).toBe(false);
  });
  it("allows optional mail configuration with explicit unset values", () => {
    expect(
      createSetupRequestSchema.parse({
        ...validSetup,
        mail: { fromAddress: null, fromName: null },
      }).mail,
    ).toEqual({ fromAddress: null, fromName: null });
  });
  it("limits setup status and progress to booleans", () => {
    expect(
      setupStatusResponseSchema.parse({ isRequired: true, memberId: "secret" }),
    ).toEqual({ isRequired: true });
    expect(
      setupProgressResponseSchema.parse({ needsInvitations: false }),
    ).toEqual({ needsInvitations: false });
    expect(setupStatusResponseSchema.safeParse({ isRequired: 1 }).success).toBe(
      false,
    );
  });
  it("requires the existing session bootstrap shape", () => {
    expect(
      createSetupResponseSchema.safeParse({
        memberId: "owner",
        token: "secret",
      }).success,
    ).toBe(false);
  });
});
