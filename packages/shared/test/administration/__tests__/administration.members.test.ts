import { describe, expect, it } from "vitest";
import {
  adminMemberDtoSchema,
  apiErrorSchema,
  changeMemberRoleRequestSchema,
  inviteMemberRequestSchema,
  listMembersRequestSchema,
  listMembersResponseSchema,
  listMemberSuggestionsRequestSchema,
  listMemberSuggestionsResponseSchema,
  memberIdParamsSchema,
  memberInvitationDtoSchema,
  revokeMemberSessionParamsSchema,
} from "../../../src/index.ts";
import {
  ADMIN_MEMBER,
  GROUP_ID,
  INVITATION,
  MEMBER,
  MEMBER_ID,
} from "./administrationTestHelpers.ts";

describe("administration member contracts", () => {
  it("keeps the complete admin row, invitation and canonical session", () => {
    expect(adminMemberDtoSchema.parse(ADMIN_MEMBER)).toEqual(ADMIN_MEMBER);
    expect(memberInvitationDtoSchema.parse(INVITATION)).toEqual(INVITATION);
    expect(
      listMembersResponseSchema.parse({
        shape: "admin",
        members: [ADMIN_MEMBER],
        nextCursor: null,
        activeAdminCount: 1,
      }),
    ).toEqual({
      shape: "admin",
      members: [ADMIN_MEMBER],
      nextCursor: null,
      activeAdminCount: 1,
    });
  });

  it("strips administration fields from directory responses", () => {
    expect(
      listMembersResponseSchema.parse({
        shape: "directory",
        members: [ADMIN_MEMBER],
        nextCursor: null,
        activeAdminCount: 1,
      }),
    ).toEqual({ shape: "directory", members: [MEMBER], nextCursor: null });
  });

  it("normalizes invitation identity and trims optional names", () => {
    expect(
      inviteMemberRequestSchema.parse({
        email: " ROSA@EXAMPLE.COM ",
        role: "viewer",
        displayName: " Rosa ",
      }),
    ).toEqual({
      email: "rosa@example.com",
      role: "viewer",
      displayName: "Rosa",
    });
  });

  it.each([
    { email: "rosa@example.com", role: "owner" },
    { email: "rosa@example.com", role: "viewer", status: "active" },
    { email: "rosa@example.com", role: "viewer", displayName: " " },
    { email: "rosa@example.com", role: "viewer", displayName: "x".repeat(81) },
  ])("rejects invalid or widened invitations: %j", (body) => {
    expect(inviteMemberRequestSchema.safeParse(body).success).toBe(false);
  });

  it("permits nullable invitation names and only a role change body", () => {
    expect(
      inviteMemberRequestSchema.parse({
        email: "rosa@example.com",
        role: "admin",
        displayName: null,
      }).displayName,
    ).toBeNull();
    expect(changeMemberRoleRequestSchema.parse({ role: "uploader" }).role).toBe(
      "uploader",
    );
    expect(
      changeMemberRoleRequestSchema.safeParse({
        role: "viewer",
        email: "other@example.com",
      }).success,
    ).toBe(false);
  });

  it("accepts only documented status filters and canonical route ids", () => {
    expect(
      listMembersRequestSchema.parse({ status: ["active", "invited"] }).status,
    ).toEqual(["active", "invited"]);
    expect(listMembersRequestSchema.safeParse({ cursor: "page" }).success).toBe(
      false,
    );
    expect(
      listMembersRequestSchema.safeParse({ status: ["unknown"] }).success,
    ).toBe(false);
    expect(memberIdParamsSchema.safeParse({ memberId: "slug" }).success).toBe(
      false,
    );
    expect(
      revokeMemberSessionParamsSchema.parse({
        memberId: MEMBER_ID,
        sessionId: GROUP_ID,
      }).sessionId,
    ).toBe(GROUP_ID);
  });

  it("normalizes suggestion email and preserves suggestion item count", () => {
    expect(
      listMemberSuggestionsRequestSchema.parse({ email: " ROSA@EXAMPLE.COM " })
        .email,
    ).toBe("rosa@example.com");
    expect(
      listMemberSuggestionsResponseSchema.parse({
        suggestions: [
          {
            person: { personId: GROUP_ID, displayName: "Rosa" },
            itemCount: 41,
          },
        ],
        nextCursor: null,
      }).suggestions[0]?.itemCount,
    ).toBe(41);
  });

  it.each(["joinedAt", "lastSeenAt", "createdAt"])(
    "rejects noncanonical member %s",
    (field) => {
      expect(
        adminMemberDtoSchema.safeParse({
          ...ADMIN_MEMBER,
          [field]: "2026-10-04T12:00:00Z",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects negative and fractional administrative counts", () => {
    expect(
      memberInvitationDtoSchema.safeParse({ ...INVITATION, sendCount: -1 })
        .success,
    ).toBe(false);
    expect(
      listMembersResponseSchema.safeParse({
        shape: "admin",
        members: [],
        nextCursor: null,
        activeAdminCount: 0.5,
      }).success,
    ).toBe(false);
  });
});
describe("administration member error contracts", () => {
  it("keeps last-admin and member-conflict details through the envelope", () => {
    expect(
      apiErrorSchema.parse({
        error: "members_last_admin",
        message: "Last admin",
        details: { activeAdminCount: 1, memberId: MEMBER_ID },
      }).details,
    ).toEqual({ activeAdminCount: 1, memberId: MEMBER_ID });
    expect(
      apiErrorSchema.parse({
        error: "members_already_active",
        message: "Already active",
        details: { memberId: MEMBER_ID },
      }).details?.memberId,
    ).toBe(MEMBER_ID);
  });
});
