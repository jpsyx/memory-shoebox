import { describe, expect, it } from "vitest";
import * as shared from "../../index.ts";
const payload = {
  shoeboxName: "Family",
  baseUrl: "https://shoebox.example",
  timezone: "UTC",
  toDisplayName: null,
  preferencesUrl: null,
  inviterDisplayName: "Rosa",
  inviterEmail: "rosa@example.com",
  invitedAddress: "ana@example.com",
  joinUrl: "https://shoebox.example/join?address=ana%40example.com",
  expiresAt: "2026-10-11T00:00:00.000Z",
  visibleItemCount: 0,
  memberCount: 2,
};
describe("invitation payload", () => {
  it("preserves the frozen copy including zero visible items", () => {
    expect(shared).toHaveProperty("invitationEmailPayloadSchema");
    expect(shared.invitationEmailPayloadSchema.parse(payload)).toEqual(payload);
  });
  it.each([
    { visibleItemCount: -1 },
    { visibleItemCount: 1.5 },
    { memberCount: -1 },
    { inviterEmail: "bad" },
    { invitedAddress: "bad" },
    { joinUrl: "/join" },
    { expiresAt: "bad" },
  ])("rejects invalid fields %j", (patch) => {
    expect(shared).toHaveProperty("invitationEmailPayloadSchema");
    expect(
      shared.invitationEmailPayloadSchema.safeParse({ ...payload, ...patch })
        .success,
    ).toBe(false);
  });
});
