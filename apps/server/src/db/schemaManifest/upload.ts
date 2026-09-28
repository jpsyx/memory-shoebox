import type { SchemaManifestShape } from "./schemaManifest.ts";

/**
 * The upload tables' half of `SCHEMA_MANIFEST`.
 *
 * The local `satisfies Pick<SchemaManifestShape, ...>` is what keeps a
 * column mistake an error at the column: without it the whole composition
 * fails as one `TS1360` at the entry point instead.
 */
export const UPLOAD_MANIFEST = {
  upload_sessions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    uploaded_by: { isNullable: false, type: "TEXT", defaultValue: null },
    state: { isNullable: false, type: "TEXT", defaultValue: null },
    visibility_rule_id: { isNullable: false, type: "TEXT", defaultValue: null },
    file_count: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    total_bytes: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    client_timezone: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    committed_at: { isNullable: true, type: "TEXT", defaultValue: null },
    last_activity_at: { isNullable: false, type: "TEXT", defaultValue: null },
    settled_at: { isNullable: true, type: "TEXT", defaultValue: null },
    notified_at: { isNullable: true, type: "TEXT", defaultValue: null },
    notified_member_count: {
      isNullable: true,
      type: "INTEGER",
      defaultValue: null,
    },
  },
  upload_files: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    upload_session_id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: true, type: "TEXT", defaultValue: null },
    position: { isNullable: false, type: "INTEGER", defaultValue: null },
    original_filename: { isNullable: false, type: "TEXT", defaultValue: null },
    declared_content_type: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    declared_bytes: { isNullable: false, type: "INTEGER", defaultValue: null },
    content_hash: { isNullable: true, type: "TEXT", defaultValue: null },
    kind: { isNullable: true, type: "TEXT", defaultValue: null },
    storage_key: { isNullable: true, type: "TEXT", defaultValue: null },
    state: { isNullable: false, type: "TEXT", defaultValue: null },
    attempt_count: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    presigned_until: { isNullable: true, type: "TEXT", defaultValue: null },
    multipart_upload_id: { isNullable: true, type: "TEXT", defaultValue: null },
    problem_code: { isNullable: true, type: "TEXT", defaultValue: null },
    problem_detail: { isNullable: true, type: "TEXT", defaultValue: null },
    captured_at: { isNullable: true, type: "TEXT", defaultValue: null },
    capture_date: { isNullable: true, type: "TEXT", defaultValue: null },
    capture_offset_minutes: {
      isNullable: true,
      type: "INTEGER",
      defaultValue: null,
    },
    capture_source: { isNullable: true, type: "TEXT", defaultValue: null },
    original_captured_at: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
    width: { isNullable: true, type: "INTEGER", defaultValue: null },
    height: { isNullable: true, type: "INTEGER", defaultValue: null },
    duration_ms: { isNullable: true, type: "INTEGER", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    updated_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  upload_batch_edits: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    upload_session_id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    tag_id: { isNullable: true, type: "TEXT", defaultValue: null },
    person_id: { isNullable: true, type: "TEXT", defaultValue: null },
    milestone_id: { isNullable: true, type: "TEXT", defaultValue: null },
    label_snapshot: { isNullable: true, type: "TEXT", defaultValue: null },
    created_by: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    undone_at: { isNullable: true, type: "TEXT", defaultValue: null },
    applied_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  upload_batch_edit_targets: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    upload_batch_edit_id: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    upload_file_id: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  pending_object_deletions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    storage_key: { isNullable: false, type: "TEXT", defaultValue: null },
    attempts: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    last_error: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    last_attempted_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
} as const satisfies Pick<
  SchemaManifestShape,
  | "upload_sessions"
  | "upload_files"
  | "upload_batch_edits"
  | "upload_batch_edit_targets"
  | "pending_object_deletions"
>;
