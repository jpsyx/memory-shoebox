import { z } from "zod";
import type { ActivityDetail } from "@memory-shoebox/shared";
import type { ActivityEventsTable } from "../db/types/operations.types.ts";

const ROLE_DETAIL_SCHEMA = z.object({
  fromRole: z.string(),
  toRole: z.string(),
});
const GROUP_DETAIL_SCHEMA = z.object({
  added: z.array(z.object({ displayName: z.string() })),
  removed: z.array(z.object({ displayName: z.string() })),
});
const VISIBILITY_DETAIL_SCHEMA = z.object({
  fromLabel: z.string().nullable().optional(),
  toLabel: z.string().nullable().optional(),
});
const SETTING_DETAIL_SCHEMA = z.object({
  fromValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  toValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

function _getCopyFromSettingValue(
  value: string | number | boolean | null,
): string | null {
  return value === null ? null : String(value);
}

function _makeGroupDetailFromStoredDetail(stored: unknown): ActivityDetail {
  const detail = GROUP_DETAIL_SCHEMA.parse(stored);
  return {
    kind: "group_membership_changed",
    addedLabels: detail.added.map((member) => {
      return member.displayName;
    }),
    removedLabels: detail.removed.map((member) => {
      return member.displayName;
    }),
  };
}

function _makeVisibilityDetailFromStoredDetail(
  stored: unknown,
): ActivityDetail {
  // Older writers snapshot rule IDs only; never look up today's labels.
  const detail = VISIBILITY_DETAIL_SCHEMA.parse(stored);
  return {
    kind: "item_visibility_changed",
    fromLabel: detail.fromLabel ?? null,
    toLabel: detail.toLabel ?? null,
  };
}

function _makeSettingDetailFromEvent(
  event: Readonly<ActivityEventsTable>,
): ActivityDetail {
  const detail = SETTING_DETAIL_SCHEMA.parse(
    JSON.parse(event.detail_json ?? "null"),
  );
  return {
    kind: "setting_changed",
    settingKey: event.subject_id ?? event.subject_label,
    fromValue: _getCopyFromSettingValue(detail.fromValue),
    toValue: _getCopyFromSettingValue(detail.toValue),
  };
}

/** Extracts only contracted historical fields, never raw stored extras. */
export function getActivityDetailFromEvent(
  event: Readonly<ActivityEventsTable>,
): ActivityDetail | null {
  if (event.detail_json === null) {
    return null;
  }
  switch (event.kind) {
    case "member_role_changed":
      return {
        kind: event.kind,
        ...ROLE_DETAIL_SCHEMA.parse(JSON.parse(event.detail_json)),
      };
    case "group_membership_changed":
      return _makeGroupDetailFromStoredDetail(JSON.parse(event.detail_json));
    case "item_visibility_changed":
      return _makeVisibilityDetailFromStoredDetail(
        JSON.parse(event.detail_json),
      );
    case "setting_changed":
      return _makeSettingDetailFromEvent(event);
    default:
      return null;
  }
}
