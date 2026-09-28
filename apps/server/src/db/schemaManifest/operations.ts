import type { SchemaManifestShape } from "./schemaManifest.ts";

/**
 * The operations tables' half of `SCHEMA_MANIFEST`.
 *
 * The local `satisfies Pick<SchemaManifestShape, ...>` is what keeps a
 * column mistake an error at the column: without it the whole composition
 * fails as one `TS1360` at the entry point instead.
 */
export const OPERATIONS_MANIFEST = {
  settings: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    scope: { isNullable: false, type: "TEXT", defaultValue: null },
    scope_id: { isNullable: true, type: "TEXT", defaultValue: null },
    key: { isNullable: false, type: "TEXT", defaultValue: null },
    value: { isNullable: false, type: "TEXT", defaultValue: null },
    updated_at: { isNullable: false, type: "TEXT", defaultValue: null },
    updated_by_member_id: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
  },
  outbound_emails: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    to_address: { isNullable: false, type: "TEXT", defaultValue: null },
    to_member_id: { isNullable: true, type: "TEXT", defaultValue: null },
    from_address: { isNullable: true, type: "TEXT", defaultValue: null },
    subject: { isNullable: false, type: "TEXT", defaultValue: null },
    payload_json: { isNullable: false, type: "TEXT", defaultValue: null },
    trigger_kind: { isNullable: false, type: "TEXT", defaultValue: null },
    trigger_id: { isNullable: false, type: "TEXT", defaultValue: null },
    idempotency_key: { isNullable: false, type: "TEXT", defaultValue: null },
    state: { isNullable: false, type: "TEXT", defaultValue: null },
    send_after: { isNullable: false, type: "TEXT", defaultValue: null },
    attempts: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    next_attempt_at: { isNullable: true, type: "TEXT", defaultValue: null },
    provider_message_id: { isNullable: true, type: "TEXT", defaultValue: null },
    provider_request_id: { isNullable: true, type: "TEXT", defaultValue: null },
    last_error_code: { isNullable: true, type: "TEXT", defaultValue: null },
    last_error_message: { isNullable: true, type: "TEXT", defaultValue: null },
    delivery_state: { isNullable: true, type: "TEXT", defaultValue: null },
    delivery_updated_at: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    sent_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  email_delivery_events: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    email_id: { isNullable: false, type: "TEXT", defaultValue: null },
    event: { isNullable: false, type: "TEXT", defaultValue: null },
    occurred_at: { isNullable: false, type: "TEXT", defaultValue: null },
    received_at: { isNullable: false, type: "TEXT", defaultValue: null },
    detail_json: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  email_suppressions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    address: { isNullable: false, type: "TEXT", defaultValue: null },
    reason: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    cleared_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  item_views: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    first_seen_at: { isNullable: false, type: "TEXT", defaultValue: null },
    first_opened_at: { isNullable: true, type: "TEXT", defaultValue: null },
    last_opened_at: { isNullable: true, type: "TEXT", defaultValue: null },
    open_count: { isNullable: false, type: "INTEGER", defaultValue: "0" },
  },
  activity_events: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    occurred_at: { isNullable: false, type: "TEXT", defaultValue: null },
    actor_member_id: { isNullable: true, type: "TEXT", defaultValue: null },
    actor_label: { isNullable: false, type: "TEXT", defaultValue: null },
    subject_kind: { isNullable: false, type: "TEXT", defaultValue: null },
    subject_id: { isNullable: true, type: "TEXT", defaultValue: null },
    subject_label: { isNullable: false, type: "TEXT", defaultValue: null },
    device_id: { isNullable: true, type: "TEXT", defaultValue: null },
    device_label: { isNullable: true, type: "TEXT", defaultValue: null },
    detail_json: { isNullable: true, type: "TEXT", defaultValue: null },
  },
} as const satisfies Pick<
  SchemaManifestShape,
  | "settings"
  | "outbound_emails"
  | "email_delivery_events"
  | "email_suppressions"
  | "item_views"
  | "activity_events"
>;
