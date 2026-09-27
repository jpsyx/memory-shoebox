import type { Database } from "./types.ts";

/**
 * Every table, every column, and whether the column is nullable, at runtime.
 *
 * `Database` in `types.ts` is the same information as a type, and types are
 * erased before any test can read them. This is the runtime copy. The shape
 * below ties the two together at compile time and the schema test ties this
 * to the database the migrations actually built, so all three have to agree.
 *
 * `false` means the column is `NOT NULL`. Keep the columns in the order
 * `data-models.md` gives them; the test compares maps, so the order is for
 * the reader.
 */
export const SCHEMA_MANIFEST = {
  members: {
    id: false,
    email: false,
    display_name: true,
    role: false,
    status: false,
    notify_on_upload: false,
    notify_on_comment: false,
    notify_on_reply: false,
    notify_on_removal: false,
    joined_at: true,
    last_signed_in_at: true,
    last_seen_at: true,
    removed_at: true,
    created_at: false,
  },
  sign_in_codes: {
    id: false,
    email: false,
    member_id: true,
    code_hash: false,
    attempts: false,
    max_attempts: false,
    expires_at: false,
    consumed_at: true,
    invalidated_at: true,
    created_at: false,
  },
  sessions: {
    id: false,
    member_id: false,
    token_hash: false,
    device_label: false,
    user_agent: true,
    created_at: false,
    last_used_at: false,
    expires_at: false,
  },
  invitations: {
    id: false,
    member_id: false,
    invited_by_member_id: false,
    created_at: false,
    expires_at: false,
    send_count: false,
    last_sent_at: false,
    revoked_at: true,
    accepted_at: true,
  },
  groups: {
    id: false,
    name: false,
    name_normalized: false,
    created_at: false,
  },
  group_members: {
    id: false,
    group_id: false,
    member_id: false,
    created_at: false,
  },
  visibility_rules: {
    id: false,
    mode: false,
    subject_digest: false,
    created_at: false,
  },
  visibility_rule_subjects: {
    id: false,
    rule_id: false,
    subject_type: false,
    member_id: true,
    group_id: true,
  },
  items: {
    id: false,
    kind: false,
    captured_at: false,
    captured_at_offset_minutes: true,
    captured_on: false,
    capture_source: false,
    original_captured_at: false,
    seq: false,
    uploaded_by: false,
    upload_session_id: true,
    visibility_rule_id: false,
    burst_id: true,
    burst_index: true,
    width: false,
    height: false,
    duration_ms: true,
    byte_size: false,
    content_type: false,
    checksum: true,
    original_filename: true,
    alt_text: true,
    created_at: false,
  },
  item_renditions: {
    id: false,
    item_id: false,
    purpose: false,
    storage_key: false,
    content_type: false,
    byte_size: false,
    width: false,
    height: false,
  },
  bursts: {
    id: false,
    upload_session_id: false,
    captured_on: false,
    starts_at: false,
    ends_at: false,
    detector_version: true,
    threshold_seconds: true,
    detected_at: false,
    is_manual: false,
    cover_item_id: true,
  },
  milestones: {
    id: false,
    name: false,
    starts_on: false,
    ends_on: false,
    blurb: true,
    created_by: true,
    created_at: false,
    updated_at: false,
  },
  item_milestones: {
    id: false,
    item_id: false,
    milestone_id: false,
    attached_by: true,
    attached_at: false,
    span_mismatch_acknowledged_at: true,
  },
  item_capture_date_changes: {
    id: false,
    item_id: false,
    milestone_id: true,
    previous_captured_at: false,
    previous_capture_date: false,
    previous_capture_source: false,
    new_captured_at: false,
    new_capture_date: false,
    changed_by: false,
    changed_at: false,
    reason: false,
  },
  tags: {
    id: false,
    name: false,
    name_normalized: false,
    created_by: true,
    created_at: false,
  },
  item_tags: {
    id: false,
    item_id: false,
    tag_id: false,
    tagged_by: true,
    tagged_at: false,
  },
  people: {
    id: false,
    display_name: false,
    member_id: true,
    preferred_face_item_id: true,
    created_by: true,
    created_at: false,
  },
  item_people: {
    id: false,
    item_id: false,
    person_id: false,
    tagged_by: true,
    tagged_at: false,
  },
  comments: {
    id: false,
    item_id: false,
    author_member_id: false,
    body: false,
    at_seconds: true,
    created_at: false,
    edited_at: true,
  },
  item_reactions: {
    id: false,
    item_id: false,
    member_id: false,
    kind: false,
    created_at: false,
  },
  comment_reactions: {
    id: false,
    comment_id: false,
    member_id: false,
    kind: false,
    created_at: false,
  },
  removal_requests: {
    id: false,
    item_id: true,
    requested_by_member_id: false,
    reason: true,
    state: false,
    decline_reason: true,
    created_at: false,
    resolved_at: true,
    resolved_by_member_id: true,
    item_uploader_member_id: false,
    item_captured_at: true,
    item_storage_key: true,
  },
  upload_sessions: {
    id: false,
    uploaded_by: false,
    state: false,
    visibility_rule_id: false,
    file_count: false,
    total_bytes: false,
    client_timezone: false,
    created_at: false,
    committed_at: true,
    last_activity_at: false,
    settled_at: true,
    notified_at: true,
    notified_member_count: true,
  },
  upload_files: {
    id: false,
    upload_session_id: false,
    item_id: true,
    position: false,
    original_filename: false,
    declared_content_type: false,
    declared_bytes: false,
    content_hash: true,
    kind: true,
    storage_key: true,
    state: false,
    attempt_count: false,
    presigned_until: true,
    multipart_upload_id: true,
    problem_code: true,
    problem_detail: true,
    captured_at: true,
    capture_date: true,
    capture_offset_minutes: true,
    capture_source: true,
    original_captured_at: true,
    width: true,
    height: true,
    duration_ms: true,
    created_at: false,
    updated_at: false,
  },
  upload_batch_edits: {
    id: false,
    upload_session_id: false,
    kind: false,
    tag_id: true,
    person_id: true,
    milestone_id: true,
    label_snapshot: true,
    created_by: false,
    created_at: false,
    undone_at: true,
    applied_at: true,
  },
  upload_batch_edit_targets: {
    id: false,
    upload_batch_edit_id: false,
    upload_file_id: false,
  },
  pending_object_deletions: {
    id: false,
    storage_key: false,
    attempts: false,
    last_error: true,
    created_at: false,
    last_attempted_at: true,
  },
} as const satisfies SchemaManifestShape;

/**
 * Every table in `Database`, mapping every one of its columns to whether the
 * Kysely type makes it nullable.
 *
 * This single mapped type does all the checking, and it is worth understanding
 * why before changing it. Because it is a **full** mapped type rather than a
 * partial one, `satisfies` rejects three different mistakes on its own:
 *
 * | Mistake                                 | What the compiler says                             |
 * | ---------------------------------------- | -------------------------------------------------- |
 * | A table left out of the manifest        | `TS1360`, naming the table                         |
 * | A column left out of a table's entry    | `TS2741`, naming the column                        |
 * | Nullability disagreeing with `Database` | `TS2322: 'false' is not assignable to type 'true'` |
 *
 * An earlier draft listed columns as a string array and needed two hand-built
 * `Exclude` guards to catch the second case, because an array cannot express
 * completeness. Those guards then had to be referenced to survive
 * `noUnusedLocals`, and deleting a guard together with its reference removed
 * the check silently. Mapping the columns as object keys makes all of that
 * unnecessary: there is nothing to leave unused and nothing to delete.
 */
type SchemaManifestShape = {
  readonly [TableName in keyof Database]: {
    readonly [ColumnName in keyof Database[TableName] &
      string]: null extends Database[TableName][ColumnName] ? true : false;
  };
};
