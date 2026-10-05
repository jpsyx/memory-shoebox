import { describe, expect, it } from "vitest";
import { getActivityFamilyFromKind } from "../../src/observation/getActivityFamilyFromKind.ts";

describe("activity families", () => {
  it.each([
    ["member_invited", "authority"],
    ["invitation_revoked", "authority"],
    ["invitation_accepted", "authority"],
    ["member_role_changed", "authority"],
    ["member_removed", "authority"],
    ["group_created", "authority"],
    ["group_renamed", "authority"],
    ["group_membership_changed", "authority"],
    ["group_deleted", "authority"],
    ["item_visibility_changed", "authority"],
    ["setting_changed", "authority"],
    ["item_deleted", "destruction"],
    ["comment_deleted", "destruction"],
    ["milestone_deleted", "destruction"],
    ["sign_in_code_requested", "access"],
    ["signed_in", "access"],
    ["sign_in_failed", "access"],
    ["signed_out", "access"],
    ["device_revoked", "access"],
    ["session_expired", "access"],
  ])("maps %s to %s", (kind, family) => {
    expect(getActivityFamilyFromKind(kind)).toBe(family);
  });
  it.each(["unknown_kind", "constructor", "toString", "__proto__"])(
    "rejects unmapped %s",
    (kind) => {
      expect(() => {
        return getActivityFamilyFromKind(kind);
      }).toThrow();
    },
  );
});
