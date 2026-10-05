import type {
  AdminGroupDto,
  AdminMemberDto,
  GetSettingsResponse,
  GroupRef,
  GroupUsageResponse,
  MemberInvitationDto,
  MemberRef,
  VisibilitySummary,
} from "../../../src/index.ts";
import type { FixedFixture } from "../../FixedFixture.types.ts";

/** Shared administration test input. */
export const MEMBER_ID =
  "019f0000-0000-7000-8000-000000000001" satisfies string;

/** Shared administration test input. */
export const GROUP_ID = "019f0000-0000-7000-8000-000000000002" satisfies string;

/** Shared administration test input. */
export const TIMESTAMP = "2026-10-04T12:00:00.000Z" satisfies string;

/** Shared administration test input. */
export const MEMBER = {
  memberId: MEMBER_ID,
  displayName: "Rosa",
} as const satisfies MemberRef;

/** Shared administration test input. */
export const INVITATION = {
  invitationId: GROUP_ID,
  invitedBy: MEMBER,
  createdAt: TIMESTAMP,
  expiresAt: TIMESTAMP,
  sendCount: 1,
  lastSentAt: TIMESTAMP,
  revokedAt: null,
  acceptedAt: null,
  isPending: true,
} as const satisfies MemberInvitationDto;

/** Shared administration test input. */
export const ADMIN_MEMBER = {
  ...MEMBER,
  email: "rosa@example.com",
  role: "admin",
  status: "active",
  joinedAt: TIMESTAMP,
  lastSignedInAt: TIMESTAMP,
  lastSeenAt: TIMESTAMP,
  removedAt: null,
  createdAt: TIMESTAMP,
  invitation: INVITATION,
  sessions: [
    {
      sessionId: GROUP_ID,
      deviceLabel: "Safari",
      createdAt: TIMESTAMP,
      lastUsedAt: TIMESTAMP,
      expiresAt: TIMESTAMP,
      isCurrent: true,
    },
  ],
  isLastActiveAdmin: true,
} as const satisfies FixedFixture<AdminMemberDto>;

/** Shared administration test input. */
export const GROUP = {
  groupId: GROUP_ID,
  name: "Cousins",
} as const satisfies GroupRef;

/** Shared administration test input. */
export const ADMIN_GROUP = {
  ...GROUP,
  createdAt: TIMESTAMP,
  members: [MEMBER],
  usedByOnlyRules: 1,
  usedByExceptRules: 2,
} as const satisfies FixedFixture<AdminGroupDto>;

/** Shared administration test input. */
export const VISIBILITY = {
  visibilityRuleId: GROUP_ID,
  mode: "except",
  label: "Except Cousins",
  subjects: [{ kind: "group", id: GROUP_ID, displayName: "Cousins" }],
} as const satisfies FixedFixture<VisibilitySummary>;

/** Shared administration test input. */
export const USAGE = {
  group: GROUP,
  narrowingItemCount: 0,
  wideningItemCount: 2,
  emptyAllowListItemCount: 0,
  membersLosingAccess: [],
  membersGainingAccess: [MEMBER],
  rules: [
    {
      ruleId: GROUP_ID,
      visibility: VISIBILITY,
      effect: "widens",
      itemCount: 2,
      visibilityAfter: { ...VISIBILITY, subjects: [], label: "Everyone" },
      becomesEmptyAllowList: false,
    },
  ],
  confirmationToken: "signed-token",
} as const satisfies FixedFixture<GroupUsageResponse>;

/** Shared administration test input. */
export const SETTINGS = {
  shoebox: { name: "My Shoebox", timezone: "UTC" },
  pile: { arrangement: "messy" },
  mail: { fromAddress: null, fromName: null },
  public: { baseUrl: null },
  defaultedKeys: ["shoebox.timezone"],
  changedBy: [{ key: "shoebox.name", updatedAt: TIMESTAMP, updatedBy: MEMBER }],
  storage: { itemCount: 0, byteSize: 0 },
} as const satisfies FixedFixture<GetSettingsResponse>;
