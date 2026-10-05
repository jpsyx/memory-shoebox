import type { CreateSetupRequest } from "../src/index.ts";
import { describe, expect, it } from "vitest";
import {
  createSetupRequestSchema,
  createSetupResponseSchema,
  setupStatusResponseSchema,
  setupProgressResponseSchema,
} from "../src/index.ts";

const VALID_SETUP = {
  admin: { displayName: " Owner ", email: " OWNER@EXAMPLE.COM " },
  shoebox: { name: "Box", timezone: "UTC" },
  public: { baseUrl: "https://family.example.com" },
} as const satisfies CreateSetupRequest;

describe("setup contracts", () => {
  it("normalizes the first admin without a requested role", () => {
    expect(createSetupRequestSchema.parse(VALID_SETUP).admin.email).toBe(
      "owner@example.com",
    );
    expect(createSetupRequestSchema.parse(VALID_SETUP).admin.displayName).toBe(
      "Owner",
    );
  });
  it.each([
    { ...VALID_SETUP, role: "admin" },
    { ...VALID_SETUP, admin: { ...VALID_SETUP.admin, role: "admin" } },
    { ...VALID_SETUP, shoebox: { name: "Box", timezone: "invalid/zone" } },
    { ...VALID_SETUP, public: { baseUrl: "javascript:alert(1)" } },
    {
      ...VALID_SETUP,
      admin: { ...VALID_SETUP.admin, displayName: "x".repeat(81) },
    },
    { ...VALID_SETUP, mail: { fromAddress: "bad", fromName: "Family" } },
    {
      ...VALID_SETUP,
      mail: {
        fromAddress: null,
        fromName: null,
        domainVerifiedAt: "2026-10-04T00:00:00.000Z",
      },
    },
    { ...VALID_SETUP, shoebox: { name: " ", timezone: "UTC" } },
  ])("rejects malformed or widened setup bodies: %j", (body) => {
    expect(createSetupRequestSchema.safeParse(body).success).toBe(false);
  });
  it("allows optional mail configuration with explicit unset values", () => {
    expect(
      createSetupRequestSchema.parse({
        ...VALID_SETUP,
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
