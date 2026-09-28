import type { Kysely } from "kysely";
import { createId } from "../../src/db/createId.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";

/** A fixed instant, so that every fixture reads as one moment in time. */
export const NOW = "2026-09-27T10:00:00.000Z";

/** Shifts an ISO instant by whole minutes. Negative goes into the past. */
export function shiftMinutes(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

/** Shifts an ISO instant by whole days. Negative goes into the past. */
export function shiftDays(instant: string, days: number): string {
  return shiftMinutes(instant, days * 24 * 60);
}

/**
 * Inserts one member and returns its id.
 *
 * Defaults to an active uploader who wants every notification, because that is
 * the row most tests need and the interesting cases are the departures from it.
 */
export async function insertMember(
  database: Kysely<Database>,
  overrides: Partial<Database["members"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  await database
    .insertInto("members")
    .values({
      id,
      email: `${id}@example.com`,
      display_name: "Abuela Rosa",
      role: "uploader",
      status: "active",
      notify_on_upload: 1,
      notify_on_comment: 1,
      notify_on_reply: 1,
      notify_on_removal: 1,
      joined_at: NOW,
      last_signed_in_at: NOW,
      last_seen_at: NOW,
      removed_at: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one session for a member and returns its id. */
export async function insertSession(
  database: Kysely<Database>,
  options: { memberId: string } & Partial<Database["sessions"]>,
): Promise<string> {
  const { memberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("sessions")
    .values({
      id,
      member_id: memberId,
      token_hash: `hash-${id}`,
      device_label: "A phone",
      user_agent: null,
      created_at: NOW,
      last_used_at: NOW,
      expires_at: shiftDays(NOW, 30),
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one invitation and returns its id. */
export async function insertInvitation(
  database: Kysely<Database>,
  options: {
    memberId: string;
    invitedByMemberId: string;
  } & Partial<Database["invitations"]>,
): Promise<string> {
  const { memberId, invitedByMemberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("invitations")
    .values({
      id,
      member_id: memberId,
      invited_by_member_id: invitedByMemberId,
      created_at: NOW,
      expires_at: shiftDays(NOW, 7),
      send_count: 1,
      last_sent_at: NOW,
      revoked_at: null,
      accepted_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one settled removal request and returns its id. */
export async function insertRemovalRequest(
  database: Kysely<Database>,
  options: {
    requestedByMemberId: string;
    itemUploaderMemberId: string;
  } & Partial<Database["removal_requests"]>,
): Promise<string> {
  const { requestedByMemberId, itemUploaderMemberId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("removal_requests")
    .values({
      id,
      // Migration 0009 adds CHECK (state <> 'open' OR item_id IS NOT NULL),
      // so only a settled request may name no photograph. A caller that wants
      // an open one has to pass `item_id` itself.
      item_id: null,
      requested_by_member_id: requestedByMemberId,
      reason: "I would rather this one came down.",
      state: "declined",
      decline_reason: "It is the only photograph of that afternoon.",
      created_at: NOW,
      resolved_at: NOW,
      resolved_by_member_id: itemUploaderMemberId,
      item_uploader_member_id: itemUploaderMemberId,
      item_captured_at: NOW,
      item_storage_key: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Writes one instance-scoped setting, JSON-encoded as the column expects. */
export async function insertInstanceSetting(
  database: Kysely<Database>,
  options: { key: string; value: unknown },
): Promise<void> {
  await database
    .insertInto("settings")
    .values({
      id: createId(),
      scope: "instance",
      scope_id: null,
      key: options.key,
      value: JSON.stringify(options.value),
      updated_at: NOW,
      updated_by_member_id: null,
    })
    .execute();
}

/** Inserts one `pending_object_deletions` row and returns its id. */
export async function insertPendingObjectDeletion(
  database: Kysely<Database>,
  options: { storageKey: string } & Partial<
    Database["pending_object_deletions"]
  >,
): Promise<string> {
  const { storageKey, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("pending_object_deletions")
    .values({
      id,
      storage_key: storageKey,
      attempts: 0,
      last_error: null,
      created_at: NOW,
      last_attempted_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one `outbound_emails` row and returns its id. */
export async function insertOutboundEmail(
  database: Kysely<Database>,
  overrides: Partial<Database["outbound_emails"]> = {},
): Promise<string> {
  const id = overrides.id ?? createId();
  await database
    .insertInto("outbound_emails")
    .values({
      id,
      kind: "sign_in_code",
      to_address: "rosa@example.com",
      to_member_id: null,
      from_address: null,
      subject: "Your code is 410233",
      payload_json: JSON.stringify({ code: "410233" }),
      trigger_kind: "sign_in_code",
      trigger_id: createId(),
      idempotency_key: `signin:${id}`,
      state: "queued",
      send_after: NOW,
      attempts: 0,
      next_attempt_at: null,
      provider_message_id: null,
      provider_request_id: null,
      last_error_code: null,
      last_error_message: null,
      delivery_state: null,
      delivery_updated_at: null,
      created_at: NOW,
      sent_at: null,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one upload session and returns its id.
 *
 * Defaults to a committed batch still transferring: `state = 'uploading'` with
 * `committed_at` set, because no byte may move before that column is written
 * and that is the only session shape the abandon sweep's file half looks at.
 * A draft is the interesting departure, so a caller wanting one passes both
 * `state: "draft"` and `committed_at: null`.
 */
export async function insertUploadSession(
  database: Kysely<Database>,
  options: { uploadedBy: string } & Partial<Database["upload_sessions"]>,
): Promise<string> {
  const { uploadedBy, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("upload_sessions")
    .values({
      id,
      uploaded_by: uploadedBy,
      state: "uploading",
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      file_count: 1,
      total_bytes: 1024,
      client_timezone: "Europe/Madrid",
      created_at: NOW,
      committed_at: NOW,
      last_activity_at: NOW,
      settled_at: null,
      notified_at: null,
      notified_member_count: null,
      ...overrides,
    })
    .execute();
  return id;
}

/** Inserts one upload file and returns its id. */
export async function insertUploadFile(
  database: Kysely<Database>,
  options: { uploadSessionId: string } & Partial<Database["upload_files"]>,
): Promise<string> {
  const { uploadSessionId, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("upload_files")
    .values({
      id,
      upload_session_id: uploadSessionId,
      item_id: null,
      position: 0,
      original_filename: "IMG_0001.jpg",
      declared_content_type: "image/jpeg",
      declared_bytes: 1024,
      content_hash: null,
      kind: "photo",
      storage_key: null,
      state: "waiting",
      attempt_count: 0,
      presigned_until: null,
      multipart_upload_id: null,
      problem_code: null,
      problem_detail: null,
      captured_at: null,
      capture_date: null,
      capture_offset_minutes: null,
      capture_source: null,
      original_captured_at: null,
      width: null,
      height: null,
      duration_ms: null,
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}

/**
 * Inserts one photograph and returns its id.
 *
 * `seq` carries a unique index, so a test wanting a second item passes its own.
 */
export async function insertItem(
  database: Kysely<Database>,
  options: { uploadedBy: string } & Partial<Database["items"]>,
): Promise<string> {
  const { uploadedBy, ...overrides } = options;
  const id = overrides.id ?? createId();
  await database
    .insertInto("items")
    .values({
      id,
      kind: "photo",
      captured_at: NOW,
      captured_at_offset_minutes: 120,
      captured_on: "2026-09-27",
      capture_source: "exif",
      original_captured_at: NOW,
      seq: 0,
      uploaded_by: uploadedBy,
      upload_session_id: null,
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      burst_id: null,
      burst_index: null,
      width: 4032,
      height: 3024,
      duration_ms: null,
      byte_size: 2_400_000,
      content_type: "image/jpeg",
      checksum: null,
      original_filename: "IMG_0001.jpg",
      alt_text: null,
      created_at: NOW,
      ...overrides,
    })
    .execute();
  return id;
}
