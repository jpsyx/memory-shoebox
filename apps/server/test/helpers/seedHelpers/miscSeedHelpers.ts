import type { Kysely } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import { NOW } from "./seedTime.ts";

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
