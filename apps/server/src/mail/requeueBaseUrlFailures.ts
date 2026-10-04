import type { z } from "zod";
import {
  emailCommonSchema,
  invitationEmailPayloadSchema,
  uploadSessionEmailPayloadSchema,
  commentEmailPayloadSchema,
  removalRequestEmailPayloadSchema,
  removalReminderEmailPayloadSchema,
  removalResolvedEmailPayloadSchema,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { OutboundEmailsTable } from "../db/types/operations.types.ts";

type RetainedKind = Exclude<OutboundEmailsTable["kind"], "sign_in_code">;
const PAYLOAD_SCHEMAS: Record<RetainedKind, z.ZodType> = {
  invitation: invitationEmailPayloadSchema,
  upload_session: uploadSessionEmailPayloadSchema,
  comment: commentEmailPayloadSchema,
  removal_request: removalRequestEmailPayloadSchema,
  removal_reminder: removalReminderEmailPayloadSchema,
  removal_resolved: removalResolvedEmailPayloadSchema,
};
async function _hasTrigger(
  options: Readonly<{
    transaction: DatabaseExecutor;
    row: OutboundEmailsTable;
  }>,
): Promise<boolean> {
  const { transaction, row } = options;
  const table =
    row.kind === "invitation" && row.trigger_kind === "invitation"
      ? "invitations"
      : row.kind === "upload_session" && row.trigger_kind === "upload_session"
        ? "upload_sessions"
        : row.kind === "comment" && row.trigger_kind === "comment"
          ? "comments"
          : row.kind.startsWith("removal_") &&
              row.trigger_kind === "removal_request"
            ? "removal_requests"
            : undefined;
  if (table === undefined) {
    return false;
  }
  return (
    (await transaction
      .selectFrom(table)
      .select("id")
      .where("id", "=", row.trigger_id)
      .executeTakeFirst()) !== undefined
  );
}
function _getLinkFieldsFromPayload(
  options: Readonly<{ kind: RetainedKind; payload: Record<string, unknown> }>,
): string[] {
  if (options.kind === "invitation") {
    return ["joinUrl"];
  }
  if (options.kind === "upload_session") {
    return ["dayUrl"];
  }
  if (options.kind === "comment") {
    return ["itemUrl"];
  }
  if (
    options.kind === "removal_request" ||
    options.kind === "removal_reminder"
  ) {
    return ["requestsUrl"];
  }
  return options.payload.outcome === "deleted" ? [] : ["itemUrl"];
}
function _getRebasedLinkFromStoredLink(
  options: Readonly<{ value: unknown; baseUrl: string; field: string }>,
): string | undefined {
  if (typeof options.value !== "string" || options.value.length === 0) {
    return undefined;
  }
  if (
    (!options.value.startsWith("/") &&
      !emailCommonSchema.shape.baseUrl.safeParse(options.value).success) ||
    options.value.startsWith("//")
  ) {
    return undefined;
  }
  try {
    const link = new URL(options.value, "https://retained.invalid");
    const expectedPath =
      options.field === "joinUrl"
        ? /^\/join$/
        : options.field === "dayUrl"
          ? /^\/$/
          : options.field === "requestsUrl"
            ? /^\/removal-requests$/
            : /^\/item\/[^/]+$/;
    if (!expectedPath.test(link.pathname)) {
      return undefined;
    }
    return `${options.baseUrl.replace(/\/$/, "")}${link.pathname}${link.search}${link.hash}`;
  } catch {
    return undefined;
  }
}
function _makeRepairedLinksFromPayload(
  options: Readonly<{
    kind: RetainedKind;
    payload: Record<string, unknown>;
    baseUrl: string;
  }>,
): Record<string, unknown> | undefined {
  const payload = { ...options.payload };
  for (const field of _getLinkFieldsFromPayload(options)) {
    const link = _getRebasedLinkFromStoredLink({
      field,
      value: payload[field],
      baseUrl: options.baseUrl,
    });
    if (link === undefined) {
      return undefined;
    }
    payload[field] = link;
  }
  const isRequesterAnswer =
    options.kind === "removal_resolved" &&
    (payload.outcome === "declined" ||
      (payload.outcome === "deleted" && payload.relation === "requester"));
  return {
    ...payload,
    baseUrl: options.baseUrl,
    preferencesUrl: isRequesterAnswer
      ? null
      : `${options.baseUrl.replace(/\/$/, "")}/account`,
  };
}
function _hasValidRetainedCommonLinks(
  payload: Readonly<Record<string, unknown>>,
): boolean {
  const { baseUrl, preferencesUrl } = payload;
  return (
    (baseUrl === "" ||
      emailCommonSchema.shape.baseUrl.safeParse(baseUrl).success) &&
    emailCommonSchema.shape.preferencesUrl.safeParse(preferencesUrl).success
  );
}
function _makeRepairedPayloadFromRow(
  options: Readonly<{ row: OutboundEmailsTable; baseUrl: string }>,
): string | undefined {
  if (options.row.kind === "sign_in_code") {
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(options.row.payload_json);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      Array.isArray(decoded)
    ) {
      return undefined;
    }
    const payload = { ...decoded } as Record<string, unknown>;
    if (!_hasValidRetainedCommonLinks(payload)) {
      return undefined;
    }
    const repaired = _makeRepairedLinksFromPayload({
      kind: options.row.kind,
      payload,
      baseUrl: options.baseUrl,
    });
    if (repaired === undefined) {
      return undefined;
    }
    return PAYLOAD_SCHEMAS[options.row.kind].safeParse(repaired).success
      ? JSON.stringify(repaired)
      : undefined;
  } catch {
    return undefined;
  }
}
async function _requeueRetainedRow(
  options: Readonly<{
    transaction: DatabaseExecutor;
    row: OutboundEmailsTable;
    payloadJson: string;
  }>,
): Promise<void> {
  const { row, payloadJson } = options;
  await options.transaction
    .updateTable("outbound_emails")
    .set({
      state: "queued",
      payload_json: payloadJson,
      attempts: 0,
      next_attempt_at: null,
      last_error_code: null,
      last_error_message: null,
    })
    .where("id", "=", row.id)
    .where("state", "=", "failed")
    .where("last_error_code", "=", "base_url_unset")
    .execute();
}
/**
 * Requeues valid recent non-code base-URL failures with extant triggers.
 */
export async function requeueBaseUrlFailures(
  options: Readonly<{
    transaction: DatabaseExecutor;
    baseUrl: string;
    now: string;
  }>,
): Promise<number> {
  const cutoff = new Date(
    Date.parse(options.now) - 7 * 86_400_000,
  ).toISOString();
  const rows = await options.transaction
    .selectFrom("outbound_emails")
    .selectAll()
    .where("state", "=", "failed")
    .where("last_error_code", "=", "base_url_unset")
    .where("kind", "!=", "sign_in_code")
    .where("created_at", ">", cutoff)
    .execute();
  let requeuedCount = 0;
  for (const row of rows) {
    const payloadJson = _makeRepairedPayloadFromRow({
      row,
      baseUrl: options.baseUrl,
    });
    if (
      payloadJson === undefined ||
      !(await _hasTrigger({ ...options, row }))
    ) {
      continue;
    }
    await _requeueRetainedRow({ ...options, row, payloadJson });
    requeuedCount += 1;
  }
  return requeuedCount;
}
