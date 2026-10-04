import { describe, expect, it } from "vitest";
import {
  adminMemberDtoSchema,
  memberInvitationDtoSchema,
  listMembersRequestSchema,
  listMembersResponseSchema,
  inviteMemberRequestSchema,
  changeMemberRoleRequestSchema,
  memberIdParamsSchema,
  revokeMemberSessionParamsSchema,
  listMemberSuggestionsResponseSchema,
  listMemberSuggestionsRequestSchema,
  adminGroupDtoSchema,
  listGroupsResponseSchema,
  createGroupRequestSchema,
  renameGroupRequestSchema,
  replaceGroupMembersRequestSchema,
  replaceGroupMembersResponseSchema,
  groupIdParamsSchema,
  deleteGroupRequestSchema,
  groupUsageResponseSchema,
  getSettingsResponseSchema,
  updateSettingsRequestSchema,
  updateSettingsResponseSchema,
  timezoneImpactDtoSchema,
  apiErrorSchema,
  apiErrorDetailsSchema,
} from "../src/index.ts";

const memberId = "019f0000-0000-7000-8000-000000000001";
const groupId = "019f0000-0000-7000-8000-000000000002";
const timestamp = "2026-10-04T12:00:00.000Z";
const member = { memberId, displayName: "Rosa" };
const invitation = {
  invitationId: groupId,
  invitedBy: member,
  createdAt: timestamp,
  expiresAt: timestamp,
  sendCount: 1,
  lastSentAt: timestamp,
  revokedAt: null,
  acceptedAt: null,
  isPending: true,
};
const adminMember = {
  ...member,
  email: "rosa@example.com",
  role: "admin",
  status: "active",
  joinedAt: timestamp,
  lastSignedInAt: timestamp,
  lastSeenAt: timestamp,
  removedAt: null,
  createdAt: timestamp,
  invitation,
  sessions: [
    {
      sessionId: groupId,
      deviceLabel: "Safari",
      createdAt: timestamp,
      lastUsedAt: timestamp,
      expiresAt: timestamp,
      isCurrent: true,
    },
  ],
  isLastActiveAdmin: true,
};
const group = { groupId, name: "Cousins" };
const adminGroup = {
  ...group,
  createdAt: timestamp,
  members: [member],
  usedByOnlyRules: 1,
  usedByExceptRules: 2,
};
const visibility = {
  visibilityRuleId: groupId,
  mode: "except",
  label: "Except Cousins",
  subjects: [{ kind: "group", id: groupId, displayName: "Cousins" }],
};
const usage = {
  group,
  narrowingItemCount: 0,
  wideningItemCount: 2,
  emptyAllowListItemCount: 0,
  membersLosingAccess: [],
  membersGainingAccess: [member],
  rules: [
    {
      ruleId: groupId,
      visibility,
      effect: "widens",
      itemCount: 2,
      visibilityAfter: { ...visibility, subjects: [], label: "Everyone" },
      becomesEmptyAllowList: false,
    },
  ],
  confirmationToken: "signed-token",
};
const settings = {
  shoebox: { name: "My Shoebox", timezone: "UTC" },
  pile: { arrangement: "messy" },
  mail: { fromAddress: null, fromName: null },
  public: { baseUrl: null },
  defaultedKeys: ["shoebox.timezone"],
  changedBy: [{ key: "shoebox.name", updatedAt: timestamp, updatedBy: member }],
  storage: { itemCount: 0, byteSize: 0 },
};

describe("administration member contracts", () => {
  it("keeps the complete admin row, invitation and canonical session", () => {
    expect(
      adminMemberDtoSchema.parse(adminMember).sessions[0]?.deviceLabel,
    ).toBe("Safari");
    expect(memberInvitationDtoSchema.parse(invitation).isPending).toBe(true);
    expect(
      listMembersResponseSchema.parse({
        shape: "admin",
        members: [adminMember],
        nextCursor: null,
        activeAdminCount: 1,
      }).shape,
    ).toBe("admin");
  });
  it("strips administration fields from directory responses", () => {
    expect(
      listMembersResponseSchema.parse({
        shape: "directory",
        members: [adminMember],
        nextCursor: null,
        activeAdminCount: 1,
      }),
    ).toEqual({ shape: "directory", members: [member], nextCursor: null });
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
      revokeMemberSessionParamsSchema.parse({ memberId, sessionId: groupId })
        .sessionId,
    ).toBe(groupId);
  });
  it("keeps person suggestions separate from member identity", () => {
    expect(
      listMemberSuggestionsRequestSchema.parse({ email: " ROSA@EXAMPLE.COM " })
        .email,
    ).toBe("rosa@example.com");
    expect(
      listMemberSuggestionsResponseSchema.parse({
        suggestions: [
          { person: { personId: groupId, displayName: "Rosa" }, itemCount: 41 },
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
          ...adminMember,
          [field]: "2026-10-04T12:00:00Z",
        }).success,
      ).toBe(false);
    },
  );
  it("rejects negative and fractional administrative counts", () => {
    expect(
      memberInvitationDtoSchema.safeParse({ ...invitation, sendCount: -1 })
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

describe("administration group contracts", () => {
  it("keeps the full admin shape and removes extras from picker groups", () => {
    expect(adminGroupDtoSchema.parse(adminGroup).usedByExceptRules).toBe(2);
    expect(
      listGroupsResponseSchema.parse({
        shape: "picker",
        groups: [adminGroup],
        nextCursor: null,
      }),
    ).toEqual({ shape: "picker", groups: [group], nextCursor: null });
  });
  it("validates group names, members and narrow mutation inputs", () => {
    expect(
      createGroupRequestSchema.parse({
        name: " Cousins ",
        memberIds: [memberId],
      }).name,
    ).toBe("Cousins");
    expect(renameGroupRequestSchema.parse({ name: "Family" }).name).toBe(
      "Family",
    );
    expect(
      replaceGroupMembersRequestSchema.parse({ memberIds: [] }).memberIds,
    ).toEqual([]);
    expect(
      replaceGroupMembersResponseSchema.parse({
        members: [member],
        nextCursor: null,
      }).members,
    ).toEqual([member]);
    expect(groupIdParamsSchema.parse({ groupId }).groupId).toBe(groupId);
    expect(
      deleteGroupRequestSchema.parse({ confirmationToken: "signed" })
        .confirmationToken,
    ).toBe("signed");
  });
  it.each([
    { name: " " },
    { name: "x".repeat(101) },
    { name: "Family", memberIds: ["slug"] },
    { name: "Family", usedByOnlyRules: 0 },
  ])("rejects invalid group creation: %j", (body) => {
    expect(createGroupRequestSchema.safeParse(body).success).toBe(false);
  });
  it("preserves both directions of group usage in conflict details", () => {
    expect(
      groupUsageResponseSchema.parse(usage).rules[0]?.visibilityAfter.subjects,
    ).toEqual([]);
    expect(apiErrorDetailsSchema.parse(usage).wideningItemCount).toBe(2);
    expect(apiErrorDetailsSchema.parse(usage)).toEqual(usage);
    expect(
      apiErrorSchema.parse({
        error: "groups_usage_changed",
        message: "Usage changed",
        details: usage,
      }).details?.membersGainingAccess,
    ).toEqual([member]);
  });
  it("rejects negative usage counts and an everyone rule naming a group", () => {
    expect(
      groupUsageResponseSchema.safeParse({ ...usage, wideningItemCount: -1 })
        .success,
    ).toBe(false);
    expect(
      groupUsageResponseSchema.safeParse({
        ...usage,
        rules: [
          {
            ...usage.rules[0],
            visibility: { ...visibility, mode: "everyone" },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("keeps last-admin and member-conflict details through the envelope", () => {
    expect(
      apiErrorSchema.parse({
        error: "members_last_admin",
        message: "Last admin",
        details: { activeAdminCount: 1, memberId },
      }).details,
    ).toEqual({ activeAdminCount: 1, memberId });
    expect(
      apiErrorSchema.parse({
        error: "members_already_active",
        message: "Already active",
        details: { memberId },
      }).details?.memberId,
    ).toBe(memberId);
  });
});

describe("administration settings contracts", () => {
  it("validates resolved settings provenance and storage", () => {
    expect(
      getSettingsResponseSchema.parse(settings).changedBy[0]?.updatedAt,
    ).toBe(timestamp);
    expect(
      getSettingsResponseSchema.safeParse({
        ...settings,
        defaultedKeys: ["visibility.generation"],
      }).success,
    ).toBe(false);
    expect(
      getSettingsResponseSchema.safeParse({
        ...settings,
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
        ...settings,
        isPreview: true,
        timezoneImpact: null,
      }).isPreview,
    ).toBe(true);
  });
  it.each([
    { shoebox: { timezone: "invalid/zone" } },
    { public: { baseUrl: "/relative" } },
    { public: { baseUrl: null } },
    { mail: { domainVerifiedAt: timestamp } },
    { setup: { pendingMemberId: memberId } },
    { pile: { arrangement: "neat" } },
  ])("rejects malformed or internal settings: %j", (body) => {
    expect(updateSettingsRequestSchema.safeParse(body).success).toBe(false);
  });
  it("validates timezone movement counts and canonical milestone references", () => {
    const impact = {
      fromZone: "UTC",
      toZone: "Europe/Madrid",
      movingItemCount: 34,
      burstEjectionItemCount: 2,
      milestoneMismatches: [
        {
          milestone: {
            milestoneId: groupId,
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
