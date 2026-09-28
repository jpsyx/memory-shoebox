import type { SchemaManifestShape } from "./schemaManifest.ts";

/**
 * The catalog tables' half of `SCHEMA_MANIFEST`.
 *
 * The local `satisfies Pick<SchemaManifestShape, ...>` is what keeps a
 * column mistake an error at the column: without it the whole composition
 * fails as one `TS1360` at the entry point instead.
 */
export const CATALOG_MANIFEST = {
  items: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    captured_at: { isNullable: false, type: "TEXT", defaultValue: null },
    captured_at_offset_minutes: {
      isNullable: true,
      type: "INTEGER",
      defaultValue: null,
    },
    captured_on: { isNullable: false, type: "TEXT", defaultValue: null },
    capture_source: { isNullable: false, type: "TEXT", defaultValue: null },
    original_captured_at: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    seq: { isNullable: false, type: "INTEGER", defaultValue: null },
    uploaded_by: { isNullable: false, type: "TEXT", defaultValue: null },
    upload_session_id: { isNullable: true, type: "TEXT", defaultValue: null },
    visibility_rule_id: { isNullable: false, type: "TEXT", defaultValue: null },
    burst_id: { isNullable: true, type: "TEXT", defaultValue: null },
    burst_index: { isNullable: true, type: "INTEGER", defaultValue: null },
    width: { isNullable: false, type: "INTEGER", defaultValue: null },
    height: { isNullable: false, type: "INTEGER", defaultValue: null },
    duration_ms: { isNullable: true, type: "INTEGER", defaultValue: null },
    byte_size: { isNullable: false, type: "INTEGER", defaultValue: null },
    content_type: { isNullable: false, type: "TEXT", defaultValue: null },
    checksum: { isNullable: true, type: "TEXT", defaultValue: null },
    original_filename: { isNullable: true, type: "TEXT", defaultValue: null },
    alt_text: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  item_renditions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    purpose: { isNullable: false, type: "TEXT", defaultValue: null },
    storage_key: { isNullable: false, type: "TEXT", defaultValue: null },
    content_type: { isNullable: false, type: "TEXT", defaultValue: null },
    byte_size: { isNullable: false, type: "INTEGER", defaultValue: null },
    width: { isNullable: false, type: "INTEGER", defaultValue: null },
    height: { isNullable: false, type: "INTEGER", defaultValue: null },
  },
  bursts: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    upload_session_id: { isNullable: false, type: "TEXT", defaultValue: null },
    captured_on: { isNullable: false, type: "TEXT", defaultValue: null },
    starts_at: { isNullable: false, type: "TEXT", defaultValue: null },
    ends_at: { isNullable: false, type: "TEXT", defaultValue: null },
    detector_version: { isNullable: true, type: "INTEGER", defaultValue: null },
    threshold_seconds: {
      isNullable: true,
      type: "INTEGER",
      defaultValue: null,
    },
    detected_at: { isNullable: false, type: "TEXT", defaultValue: null },
    is_manual: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    cover_item_id: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  milestones: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    name: { isNullable: false, type: "TEXT", defaultValue: null },
    starts_on: { isNullable: false, type: "TEXT", defaultValue: null },
    ends_on: { isNullable: false, type: "TEXT", defaultValue: null },
    blurb: { isNullable: true, type: "TEXT", defaultValue: null },
    created_by: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    updated_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  item_milestones: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    milestone_id: { isNullable: false, type: "TEXT", defaultValue: null },
    attached_by: { isNullable: true, type: "TEXT", defaultValue: null },
    attached_at: { isNullable: false, type: "TEXT", defaultValue: null },
    span_mismatch_acknowledged_at: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
  },
  item_capture_date_changes: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    milestone_id: { isNullable: true, type: "TEXT", defaultValue: null },
    previous_captured_at: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    previous_capture_date: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    previous_capture_source: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    new_captured_at: { isNullable: false, type: "TEXT", defaultValue: null },
    new_capture_date: { isNullable: false, type: "TEXT", defaultValue: null },
    changed_by: { isNullable: false, type: "TEXT", defaultValue: null },
    changed_at: { isNullable: false, type: "TEXT", defaultValue: null },
    reason: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  tags: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    name: { isNullable: false, type: "TEXT", defaultValue: null },
    name_normalized: { isNullable: false, type: "TEXT", defaultValue: null },
    created_by: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  item_tags: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    tag_id: { isNullable: false, type: "TEXT", defaultValue: null },
    tagged_by: { isNullable: true, type: "TEXT", defaultValue: null },
    tagged_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  people: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    display_name: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: true, type: "TEXT", defaultValue: null },
    preferred_face_item_id: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
    created_by: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  item_people: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    person_id: { isNullable: false, type: "TEXT", defaultValue: null },
    tagged_by: { isNullable: true, type: "TEXT", defaultValue: null },
    tagged_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
} as const satisfies Pick<
  SchemaManifestShape,
  | "items"
  | "item_renditions"
  | "bursts"
  | "milestones"
  | "item_milestones"
  | "item_capture_date_changes"
  | "tags"
  | "item_tags"
  | "people"
  | "item_people"
>;
