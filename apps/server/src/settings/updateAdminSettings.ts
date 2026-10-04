import {
  EDITABLE_INSTANCE_SETTING_KEYS,
  SETTING_DEFINITIONS,
  updateSettingsRequestSchema,
  type EditableInstanceSettingKey,
  type UpdateSettingsRequest,
  type UpdateSettingsResponse,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { requeueBaseUrlFailures } from "../mail/requeueBaseUrlFailures.ts";
import { readAdminSettings } from "./readAdminSettings.ts";
import { readInstanceSettings } from "./readInstanceSettings.ts";
import { saveInstanceSetting } from "./saveInstanceSetting.ts";
import {
  previewTimezoneChange,
  type TimezoneChangePlan,
} from "./previewTimezoneChange.ts";
import { applyTimezoneChange } from "./applyTimezoneChange.ts";

type UpdateAdminSettingsOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  body: UpdateSettingsRequest;
  isPreview: boolean;
  now: string;
};
type SettingChange = {
  key: EditableInstanceSettingKey;
  fromValue: string | null;
  toValue: string | null;
};
const BODY_SCHEMA = updateSettingsRequestSchema.omit({ preview: true });
const INTERNAL_FIELDS = new Set([
  "mail.domain_verified_at",
  "mail.domain_last_check_error",
  "visibility.generation",
  "setup.pending_member_id",
  "domainVerifiedAt",
  "domainLastCheckError",
  "domain_verified_at",
  "domain_last_check_error",
  "generation",
  "pendingMemberId",
  "pending_member_id",
]);
function _assertNoInternalFields(body: unknown): void {
  if (typeof body !== "object" || body === null) {
    return;
  }
  for (const [key, value] of Object.entries(body)) {
    if (INTERNAL_FIELDS.has(key)) {
      throw new ApiError({
        statusCode: 400,
        code: "settings_not_writable",
        message: "Internal settings are not writable.",
      });
    }
    _assertNoInternalFields(value);
  }
}
function _getEntriesFromBody(
  body: Readonly<UpdateSettingsRequest>,
): Array<[EditableInstanceSettingKey, string | null]> {
  const entries: Array<
    [EditableInstanceSettingKey, string | null | undefined]
  > = [
    ["shoebox.name", body.shoebox?.name],
    ["shoebox.timezone", body.shoebox?.timezone],
    ["pile.arrangement", body.pile?.arrangement],
    ["mail.from_address", body.mail?.fromAddress],
    ["mail.from_name", body.mail?.fromName],
    ["public.base_url", body.public?.baseUrl],
  ];
  return entries.flatMap(([key, value]) => {
    return value === undefined ? [] : [[key, value]];
  });
}
function _assertInstanceScope(key: EditableInstanceSettingKey): void {
  if (!SETTING_DEFINITIONS[key].scopes.includes("instance")) {
    throw new ApiError({
      statusCode: 400,
      code: "settings_scope_forbidden",
      message: "This setting does not permit instance scope.",
    });
  }
}
function _getDomainFromAddress(address: string | null): string | undefined {
  return address?.split("@").at(-1)?.toLowerCase();
}
async function _clearChangedDomainFacts(
  options: Readonly<{
    database: DatabaseExecutor;
    changes: readonly SettingChange[];
    now: string;
  }>,
): Promise<void> {
  const senderChange = options.changes.find((change) => {
    return change.key === "mail.from_address";
  });
  if (
    senderChange === undefined ||
    _getDomainFromAddress(senderChange.fromValue) ===
      _getDomainFromAddress(senderChange.toValue)
  ) {
    return;
  }
  for (const key of [
    "mail.domain_verified_at",
    "mail.domain_last_check_error",
  ] as const) {
    await saveInstanceSetting({
      transaction: options.database,
      key,
      value: null,
      memberId: undefined,
      now: options.now,
    });
  }
}
async function _writeSettingChange(
  options: Readonly<UpdateAdminSettingsOptions & { change: SettingChange }>,
): Promise<void> {
  const { change } = options;
  await saveInstanceSetting({
    transaction: options.database,
    key: change.key,
    value: change.toValue,
    memberId: options.viewer.memberId,
    now: options.now,
  });
  await writeActivityEvent({
    transaction: options.database,
    viewer: options.viewer,
    kind: "setting_changed",
    subjectKind: "setting",
    subjectId: change.key,
    subjectLabel: change.key,
    detail: { fromValue: change.fromValue, toValue: change.toValue },
    now: options.now,
  });
}
async function _applySettingsChanges(
  options: Readonly<
    UpdateAdminSettingsOptions & {
      changes: readonly SettingChange[];
      plan: TimezoneChangePlan | undefined;
    }
  >,
): Promise<void> {
  for (const change of options.changes) {
    await _writeSettingChange({ ...options, change });
  }
  if (options.plan !== undefined) {
    await applyTimezoneChange({
      transaction: options.database,
      plan: options.plan,
      memberId: options.viewer.memberId,
      now: options.now,
    });
  }
  await _clearChangedDomainFacts(options);
  const baseUrl = options.changes.find((change) => {
    return change.key === "public.base_url";
  })?.toValue;
  if (baseUrl !== undefined && baseUrl !== null) {
    await requeueBaseUrlFailures({
      transaction: options.database,
      baseUrl,
      now: options.now,
    });
  }
}
async function _calculateAndUpdateSettings(
  options: Readonly<UpdateAdminSettingsOptions>,
): Promise<UpdateSettingsResponse> {
  const current = await readInstanceSettings({
    database: options.database,
    keys: EDITABLE_INSTANCE_SETTING_KEYS,
  });
  const changes = _getEntriesFromBody(options.body).flatMap(
    ([key, toValue]) => {
      _assertInstanceScope(key);
      return current[key] === toValue
        ? []
        : [{ key, fromValue: current[key], toValue }];
    },
  );
  const zone = changes.find((change) => {
    return change.key === "shoebox.timezone";
  });
  const plan =
    zone === undefined
      ? undefined
      : await previewTimezoneChange({
          database: options.database,
          fromZone: current["shoebox.timezone"],
          toZone: zone.toValue!,
        });
  if (!options.isPreview) {
    await _applySettingsChanges({ ...options, changes, plan });
  }
  return {
    ...(await readAdminSettings(options.database)),
    isPreview: options.isPreview,
    timezoneImpact: plan?.impact ?? null,
  };
}
/**
 * Validates six settings and computes or applies their effects atomically.
 */
export async function updateAdminSettings(
  options: Readonly<UpdateAdminSettingsOptions>,
): Promise<UpdateSettingsResponse> {
  if (!options.viewer.isAdmin) {
    throw ApiError.forbidden("settings_forbidden");
  }
  _assertNoInternalFields(options.body);
  const body = BODY_SCHEMA.parse(options.body);
  if (options.isPreview) {
    return _calculateAndUpdateSettings({ ...options, body });
  }
  return runInImmediateTransaction({
    database: options.database,
    callback: (database) => {
      return _calculateAndUpdateSettings({ ...options, database, body });
    },
  });
}
