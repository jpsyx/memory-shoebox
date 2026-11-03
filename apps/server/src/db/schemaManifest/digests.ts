import type { SchemaManifestShape } from "./schemaManifest.ts";

/** Column contracts for digest storage. */
export const DIGESTS_MANIFEST = {
  notification_digest_events: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    category: { isNullable: false, type: "TEXT", defaultValue: null },
    source_kind: { isNullable: false, type: "TEXT", defaultValue: null },
    source_id: { isNullable: false, type: "TEXT", defaultValue: null },
    occurred_at: { isNullable: false, type: "TEXT", defaultValue: null },
    deduplication_key: { isNullable: false, type: "TEXT", defaultValue: null },
    state: { isNullable: false, type: "TEXT", defaultValue: null },
    batch_id: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  notification_digest_batches: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    send_date: { isNullable: false, type: "TEXT", defaultValue: null },
    timezone: { isNullable: false, type: "TEXT", defaultValue: null },
    cutoff_local_date: { isNullable: false, type: "TEXT", defaultValue: null },
    prepared_at: { isNullable: false, type: "TEXT", defaultValue: null },
    outbound_email_id: { isNullable: true, type: "TEXT", defaultValue: null },
    eligibility_snapshot_json: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
    delivery_snapshot_json: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
    provider_attempted_at: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
  },
} as const satisfies Pick<
  SchemaManifestShape,
  "notification_digest_events" | "notification_digest_batches"
>;
