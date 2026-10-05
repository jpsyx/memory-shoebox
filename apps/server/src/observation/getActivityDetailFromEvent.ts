import { z } from "zod";
import type { ActivityDetail } from "@memory-shoebox/shared";
import type { ActivityEventsTable } from "../db/types/operations.types.ts";

function _getCopyFromSettingValue(
  value: string | number | boolean | undefined,
): string | undefined {
  return value === undefined ? undefined : String(value);
}

function _makeGroupDetailFromStoredDetail(stored: unknown): ActivityDetail {
  const detail = z
    .object({
      added: z.array(z.object({ displayName: z.string() })),
      removed: z.array(z.object({ displayName: z.string() })),
    })
    .parse(stored);
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
  // Stored visibility history may contain only rule IDs.
  // Keep its labels historical.
  const detail = z
    .object({
      fromLabel: z.string().nullable().optional(),
      toLabel: z.string().nullable().optional(),
    })
    .parse(stored);
  return {
    kind: "item_visibility_changed",
    fromLabel: detail.fromLabel ?? null,
    toLabel: detail.toLabel ?? null,
  };
}

function _makeSettingDetailFromEvent(
  event: Readonly<ActivityEventsTable>,
): ActivityDetail {
  const detail = z
    .object({
      fromValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      toValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
    .parse(JSON.parse(event.detail_json ?? "null"));
  return {
    kind: "setting_changed",
    settingKey: event.subject_id ?? event.subject_label,
    fromValue: _getCopyFromSettingValue(detail.fromValue ?? undefined) ?? null,
    toValue: _getCopyFromSettingValue(detail.toValue ?? undefined) ?? null,
  };
}

/** Extracts only contracted historical fields, never raw stored extras. */
export function getActivityDetailFromEvent(
  event: Readonly<ActivityEventsTable>,
): ActivityDetail | undefined {
  if (event.detail_json === null) {
    return undefined;
  }
  switch (event.kind) {
    case "member_role_changed":
      return {
        kind: event.kind,
        ...z
          .object({
            fromRole: z.string(),
            toRole: z.string(),
          })
          .parse(JSON.parse(event.detail_json)),
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
      return undefined;
  }
}
