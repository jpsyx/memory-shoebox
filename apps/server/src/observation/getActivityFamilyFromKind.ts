import type { ActivityFamily } from "@memory-shoebox/shared";

/** Exhaustive presentation groups for migration 0007's durable event kinds. */
export const ACTIVITY_KINDS_BY_FAMILY: Record<
  ActivityFamily,
  readonly string[]
> = {
  authority: [
    "member_invited",
    "invitation_revoked",
    "invitation_accepted",
    "member_role_changed",
    "member_removed",
    "group_created",
    "group_renamed",
    "group_membership_changed",
    "group_deleted",
    "item_visibility_changed",
    "setting_changed",
  ],
  destruction: ["item_deleted", "comment_deleted", "milestone_deleted"],
  access: [
    "sign_in_code_requested",
    "signed_in",
    "sign_in_failed",
    "signed_out",
    "device_revoked",
    "session_expired",
  ],
};

/** Returns a known event family; schema or storage drift fails loudly. */
export function getActivityFamilyFromKind(kind: string): ActivityFamily {
  const family = (
    Object.keys(ACTIVITY_KINDS_BY_FAMILY) as ActivityFamily[]
  ).find((candidate) => {
    return ACTIVITY_KINDS_BY_FAMILY[candidate].includes(kind);
  });
  if (family === undefined) {
    throw new Error(`Unknown activity kind: ${kind}`);
  }
  return family;
}
