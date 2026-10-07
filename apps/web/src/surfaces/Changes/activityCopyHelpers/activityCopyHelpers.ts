import type { ActivityEntryDto, ActivitySubject } from "@memory-shoebox/shared";
const KIND_SENTENCES: Record<string, string> = {
  sign_in_code_requested: "requested a sign-in code for",
  signed_in: "signed in:",
  sign_in_failed: "had a failed sign-in attempt:",
  signed_out: "signed out:",
  device_revoked: "signed out a device remotely:",
  session_expired: "had a session expire:",
  member_invited: "invited",
  invitation_revoked: "revoked the invitation for",
  invitation_accepted: "accepted the invitation for",
  member_role_changed: "changed the role of",
  member_removed: "removed",
  group_created: "created the group",
  group_renamed: "renamed the group",
  group_membership_changed: "changed membership of",
  group_deleted: "deleted the group",
  item_visibility_changed: "changed who can see",
  setting_changed: "changed the setting",
  item_deleted: "deleted",
  comment_deleted: "deleted the comment",
  milestone_deleted: "deleted the milestone",
} as const;
const SETTING_NAMES: Record<string, string> = {
  "shoebox.name": "Shoebox name",
  "shoebox.timezone": "Shoebox timezone",
  "pile.arrangement": "timeline arrangement",
  "mail.from_address": "sending address",
  "mail.from_name": "sender name",
  "public.base_url": "public address",
} as const;
/**
 * Readable captions for the known history vocabulary; unknown kinds stay safe.
 */
export function activityKindLabel(kind: string): string {
  if (!Object.hasOwn(KIND_SENTENCES, kind)) {
    return "Other change";
  }
  const words = kind.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
/**
 * Known setting-key captions are readable; historical labels otherwise stay
 * intact.
 */
export function activitySubjectLabel(
  subject: Readonly<ActivitySubject>,
): string {
  return subject.kind === "setting" &&
    subject.label === subject.id &&
    Object.hasOwn(SETTING_NAMES, subject.label)
    ? SETTING_NAMES[subject.label]!
    : subject.label;
}
function _detailSentence(
  entry: Readonly<ActivityEntryDto>,
): string | undefined {
  const { detail, subject } = entry;
  if (detail === null || detail.kind !== entry.kind) {
    return undefined;
  }
  switch (detail.kind) {
    case "member_role_changed":
      return `changed ${subject.label} from ${detail.fromRole} to ${detail.toRole}.`;
    case "group_membership_changed": {
      const additions =
        detail.addedLabels.length > 0
          ? ` Added ${detail.addedLabels.join(", ")}.`
          : "";
      const removals =
        detail.removedLabels.length > 0
          ? ` Removed ${detail.removedLabels.join(", ")}.`
          : "";
      return `changed membership of ${subject.label}.${additions}${removals}`;
    }
    case "item_visibility_changed":
      return detail.fromLabel === null && detail.toLabel === null
        ? `changed who can see ${subject.label}. Earlier and later visibility labels were not recorded.`
        : `changed who can see ${subject.label}, from ${detail.fromLabel ?? "an unrecorded earlier visibility"} to ${detail.toLabel ?? "an unrecorded later visibility"}.`;
    case "setting_changed": {
      const setting = Object.hasOwn(SETTING_NAMES, detail.settingKey)
        ? `the ${SETTING_NAMES[detail.settingKey]}`
        : detail.settingKey;
      return `changed ${setting} from ${detail.fromValue ?? "unset"} to ${detail.toValue ?? "unset"}.`;
    }
  }
}
/** A historical sentence using only the delivered labels and narrow details. */
export function activitySentence(entry: Readonly<ActivityEntryDto>): string {
  const detail = _detailSentence(entry);
  if (detail !== undefined) {
    return detail;
  }
  const sentence = KIND_SENTENCES[entry.kind];
  if (!Object.hasOwn(KIND_SENTENCES, entry.kind) || sentence === undefined) {
    return `recorded a change to ${entry.subject.label} (${entry.kind}).`;
  }
  const ending = entry.kind === "member_removed" ? " from the Shoebox." : ".";
  const suffix =
    entry.kind === "milestone_deleted" ? " Its photographs stayed." : "";
  return `${sentence} ${entry.subject.label}${ending}${suffix}`;
}
/**
 * Groups all loaded pages into local days without changing the server order.
 */
export function makeActivityDaysFromEntries(
  options: Readonly<{
    entries: readonly ActivityEntryDto[];
    timezone: string;
  }>,
): Array<{
  day: string;
  entries: ActivityEntryDto[];
}> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: options.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const days = new Map<string, ActivityEntryDto[]>();
  options.entries.forEach((entry) => {
    const day = formatter.format(new Date(entry.occurredAt));
    const entries = days.get(day) ?? [];
    entries.push(entry);
    days.set(day, entries);
  });
  return Array.from(days, ([day, entries]) => {
    return { day, entries };
  });
}
