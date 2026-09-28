import type { Kysely } from "kysely";
import { createId } from "../../src/db/ids.ts";
import type { Database } from "../../src/db/types.ts";

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
      // Null is legal only once the request is no longer open
      // (migration 0009), so an open fixture carries a snapshot instead.
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
