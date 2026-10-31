import { describe, expect, it } from "vitest";
import * as shared from "../src/index.ts";

const body = {
  expectedAvatarId: null,
  contentType: "image/jpeg",
  byteSize: 1024,
  crop: { centerX: 0.5, centerY: 0.5, zoom: 1 },
};
describe("avatar contracts", () => {
  it("accepts bounded supported still-image reservations and rejects unsafe envelopes", () => {
    expect(shared).toHaveProperty("reserveAvatarRequestSchema");
    const schema = shared.reserveAvatarRequestSchema;
    expect(schema.parse(body)).toEqual(body);
    for (const patch of [
      { contentType: "image/svg+xml" },
      { byteSize: 10485761 },
      { byteSize: 0 },
      { crop: { centerX: -1, centerY: 0.5, zoom: 1 } },
      { crop: { centerX: 0.5, centerY: 0.5, zoom: 9 } },
    ])
      expect(schema.safeParse({ ...body, ...patch }).success).toBe(false);
  });
  it("requires nullable member avatars with UUID, HTTP URL and precise timestamps", () => {
    const member = {
      memberId: "019f1234-0000-7000-8000-000000000009",
      displayName: "Name",
    };
    expect(shared.memberRefSchema.safeParse(member).success).toBe(false);
    expect(
      shared.memberRefSchema.safeParse({ ...member, avatar: null }).success,
    ).toBe(true);
    expect(shared).toHaveProperty("avatarRefSchema");
    expect(
      shared.avatarRefSchema.safeParse({
        avatarId: member.memberId,
        url: "javascript:alert(1)",
        issuedAt: "2026-09-27T00:00:00.000Z",
        expiresAt: "2026-09-27T01:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
