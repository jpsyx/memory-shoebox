import type { ActivityEntryDto, PresenceRow } from "@memory-shoebox/shared";
/** Stable historical identities for observation scenarios. */
export const OBSERVATION_MEMBER_ID: string =
  "018f0000-0000-7000-8000-000000000001";
/**
 * A complete never-arrived presence row; individual facts can be overridden.
 */
export function makePresenceRowFromOverrides(
  overrides: Readonly<Partial<PresenceRow>> = {},
): PresenceRow {
  return {
    member: { memberId: OBSERVATION_MEMBER_ID, displayName: "Tomás" },
    email: "tomas@example.com",
    status: "invited",
    invitedAt: "2026-09-01T10:00:00.000Z",
    joinedAt: null,
    lastSignedInAt: null,
    lastSeenAt: null,
    activeDaysCount: 0,
    activeDaysWindowDays: 90,
    itemsOpenedCount: 0,
    commentsWrittenCount: 0,
    reactionsLeftCount: 0,
    ...overrides,
  };
}
/**
 * Labels and device snapshots survive absent live actor and subject identities.
 */
export function makeActivityEntryFromOverrides(
  overrides: Readonly<Partial<ActivityEntryDto>> = {},
): ActivityEntryDto {
  return {
    entryId: OBSERVATION_MEMBER_ID,
    kind: "item_deleted",
    family: "destruction",
    occurredAt: "2026-09-17T00:10:00.000Z",
    actor: { memberId: null, label: "Former Papá" },
    subject: { kind: "item", id: null, label: "The old photograph" },
    deviceLabel: "Old iPhone",
    detail: null,
    ...overrides,
  };
}
