import { describe, expect, it } from "vitest";
import {
  getSettingsResponseSchema,
  timezoneImpactDtoSchema,
  updateSettingsRequestSchema,
  updateSettingsResponseSchema,
} from "../../../src/index.ts";
import {
  GROUP_ID,
  MEMBER_ID,
  SETTINGS,
  TIMESTAMP,
} from "./administrationTestHelpers.ts";

describe("administration settings contracts", () => {
  it("retains deployed version in read and write snapshots and rejects version edits", () => {
    const snapshot = { ...SETTINGS, version: "2.4.1" };
    expect(getSettingsResponseSchema.parse(snapshot)).toHaveProperty(
      "version",
      "2.4.1",
    );
    expect(
      updateSettingsResponseSchema.parse({
        ...snapshot,
        isPreview: false,
        timezoneImpact: null,
      }),
    ).toHaveProperty("version", "2.4.1");
    expect(
      getSettingsResponseSchema.safeParse({ ...snapshot, version: undefined })
        .success,
    ).toBe(false);
    expect(
      updateSettingsRequestSchema.safeParse({ version: "3.0.0" }).success,
    ).toBe(false);
  });

  it("preserves provenance timestamps and rejects internal default keys or negative storage bytes", () => {
    expect(
      getSettingsResponseSchema.parse(SETTINGS).changedBy[0]?.updatedAt,
    ).toBe(TIMESTAMP);
    expect(
      getSettingsResponseSchema.safeParse({
        ...SETTINGS,
        defaultedKeys: ["visibility.generation"],
      }).success,
    ).toBe(false);
    expect(
      getSettingsResponseSchema.safeParse({
        ...SETTINGS,
        storage: { itemCount: 0, byteSize: -1 },
      }).success,
    ).toBe(false);
  });

  it("accepts partial registry-backed values and previews", () => {
    expect(
      updateSettingsRequestSchema.parse({
        preview: false,
        shoebox: { timezone: "Europe/Madrid" },
        mail: { fromAddress: null },
      }),
    ).toEqual({
      preview: false,
      shoebox: { timezone: "Europe/Madrid" },
      mail: { fromAddress: null },
    });
    expect(
      updateSettingsResponseSchema.parse({
        ...SETTINGS,
        isPreview: true,
        timezoneImpact: null,
      }).isPreview,
    ).toBe(true);
  });

  it.each([
    { shoebox: { timezone: "invalid/zone" } },
    { public: { baseUrl: "/relative" } },
    { public: { baseUrl: null } },
    { mail: { domainVerifiedAt: TIMESTAMP } },
    { setup: { pendingMemberId: MEMBER_ID } },
    { pile: { arrangement: "neat" } },
  ])("rejects malformed or internal settings: %j", (body) => {
    expect(updateSettingsRequestSchema.safeParse(body).success).toBe(false);
  });

  it("preserves timezone moving counts and rejects negative counts", () => {
    const impact = {
      fromZone: "UTC",
      toZone: "Europe/Madrid",
      movingItemCount: 34,
      burstEjectionItemCount: 2,
      milestoneMismatches: [
        {
          milestone: {
            milestoneId: GROUP_ID,
            name: "Visit",
            startsOn: "2026-10-01",
            endsOn: "2026-10-04",
            blurb: null,
          },
          itemCount: 1,
        },
      ],
    };
    expect(timezoneImpactDtoSchema.parse(impact).movingItemCount).toBe(34);
    expect(
      timezoneImpactDtoSchema.safeParse({ ...impact, movingItemCount: -1 })
        .success,
    ).toBe(false);
  });
});
