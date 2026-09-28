import type { ForeignKeyInfo, IndexInfo } from "../introspect.ts";
import { indexColumns } from "./indexColumns.ts";

/** The tables migration 'operations' creates, as `Database` names them. */
type OperationsTable =
  | "settings"
  | "outbound_emails"
  | "email_delivery_events"
  | "email_suppressions"
  | "item_views"
  | "activity_events";

/** Every foreign key on a operations table. See `EXPECTED_FOREIGN_KEYS`. */
export const OPERATIONS_FOREIGN_KEYS: Record<
  OperationsTable,
  ForeignKeyInfo[]
> = {
  settings: [
    // `settings` does have a foreign key, which is easy to miss because the
    // table reads as pure key and value.
    {
      column: "updated_by_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  outbound_emails: [
    // SET NULL, and `trigger_id` has no key at all: the trigger can be
    // deleted and the mail record must outlive it.
    {
      column: "to_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  email_delivery_events: [
    {
      column: "email_id",
      referencesTable: "outbound_emails",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  // Keyed by address rather than by member: the provider suppresses an
  // address, which may belong to nobody here.
  email_suppressions: [],
  item_views: [
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  activity_events: [
    // Two keys and no third: `subject_id` deliberately has none, because an
    // audit log outlives its subjects and an `item_deleted` row must hold a
    // dangling id.
    {
      column: "actor_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "device_id",
      referencesTable: "sessions",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
};

/** Every declared index on a operations table. See `EXPECTED_INDEXES`. */
export const OPERATIONS_INDEXES: Record<OperationsTable, IndexInfo[]> = {
  settings: [
    // Both unique and both partial, and they need to be both: a plain
    // `UNIQUE (scope, scope_id, key)` allows two instance rows for one key,
    // because `scope_id` is null on every instance row and SQLite treats
    // distinct nulls as distinct.
    {
      name: "settings__one_instance_value",
      columns: indexColumns("key"),
      isUnique: true,
    },
    {
      name: "settings__one_member_value",
      columns: indexColumns("scope_id", "key"),
      isUnique: true,
    },
  ],
  outbound_emails: [
    // The unique on `idempotency_key` is what stops a retried trigger sending
    // a second copy of the same mail. It is the only thing that stops it.
    {
      name: "outbound_emails__idempotency_key",
      columns: indexColumns("idempotency_key"),
      isUnique: true,
    },
    {
      name: "outbound_emails__state_created",
      columns: indexColumns("state", "created_at"),
      isUnique: false,
    },
    {
      name: "outbound_emails__state_next_attempt",
      columns: indexColumns("state", "next_attempt_at"),
      isUnique: false,
    },
  ],
  email_delivery_events: [
    // UNIQUE for webhook replay safety: a provider redelivering the same
    // event must not write a second row.
    {
      name: "email_delivery_events__email_event_occurred",
      columns: indexColumns("email_id", "event", "occurred_at"),
      isUnique: true,
    },
  ],
  email_suppressions: [
    {
      name: "email_suppressions__address",
      columns: indexColumns("address"),
      isUnique: true,
    },
  ],
  item_views: [
    // `__member_item` is unique because it is the upsert target: lose the
    // `UNIQUE` and every view writes a new row instead of updating one, and
    // `open_count` stops counting.
    {
      name: "item_views__item_member",
      columns: indexColumns("item_id", "member_id"),
      isUnique: false,
    },
    {
      name: "item_views__member_item",
      columns: indexColumns("member_id", "item_id"),
      isUnique: true,
    },
    {
      name: "item_views__opened_by_item",
      columns: indexColumns("item_id"),
      isUnique: false,
    },
    {
      name: "item_views__opened_by_member",
      columns: indexColumns("member_id"),
      isUnique: false,
    },
  ],
  activity_events: [
    // `__by_device` is not in the document's index list. Migration 0007
    // added it for the same reason as `upload_files__by_item`: the
    // `device_id` SET NULL needs an index or deleting a session scans the
    // whole log.
    {
      name: "activity_events__actor_occurred",
      columns: indexColumns("actor_member_id", "occurred_at desc"),
      isUnique: false,
    },
    {
      name: "activity_events__by_device",
      columns: indexColumns("device_id"),
      isUnique: false,
    },
    {
      name: "activity_events__kind_occurred",
      columns: indexColumns("kind", "occurred_at desc"),
      isUnique: false,
    },
    {
      name: "activity_events__occurred",
      columns: indexColumns("occurred_at desc"),
      isUnique: false,
    },
    {
      name: "activity_events__subject_occurred",
      columns: indexColumns("subject_kind", "subject_id", "occurred_at desc"),
      isUnique: false,
    },
  ],
};

/**
 * Every table-level `UNIQUE` on a operations table. See
 * `EXPECTED_UNIQUE_CONSTRAINTS`.
 */
export const OPERATIONS_UNIQUE_CONSTRAINTS: Record<
  OperationsTable,
  string[][]
> = {
  settings: [],
  outbound_emails: [],
  email_delivery_events: [],
  email_suppressions: [],
  item_views: [],
  activity_events: [],
};
