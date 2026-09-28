import type { Database } from "./types/db.types.ts";

/**
 * Every table, every column, and what SQLite actually enforces about it:
 * nullability, declared type, and default expression.
 *
 * `Database` in `types.ts` is the nullability half of this as a type, and
 * types are erased before any test can read them. This is the runtime copy.
 * The shape below ties the two together at compile time and the schema test
 * ties this to the database the migrations actually built, so all three have
 * to agree.
 *
 * `isNullable: false` means the column is `NOT NULL`. `type` is what the
 * migration declared, verbatim, which for this schema is always `TEXT`,
 * `INTEGER` or `REAL`. `defaultValue` is the `DEFAULT` expression as SQLite
 * reports it, so a string default keeps its quotes (`"'viewer'"`) and a
 * numeric one arrives as a string (`"3"`); null means the column declares no
 * default at all.
 *
 * **Type and default are here because nullability alone catches neither of
 * the mistakes they make possible.** SQLite's affinity rules mean
 * `items.byte_size` retyped from `INTEGER` to `TEXT` still stores every
 * number the application writes and every query still returns rows;
 * `comments.at_seconds` retyped from `REAL` to `TEXT` silently turns the
 * scrubber's fractional offsets into strings that sort lexicographically. A
 * dropped `DEFAULT 3` on `sign_in_codes.max_attempts` or a flipped
 * `DEFAULT 1` on `members.notify_on_upload` changes what a row means without
 * changing whether any row is legal. None of those fails a test that only
 * reads `notnull`.
 *
 * Transcribed against `data-models.md`, which gives an explicit
 * type-and-default table for `members`, `sign_in_codes`, `sessions`,
 * `invitations` and `items` and describes the rest in prose. Every column the
 * document types agrees with what the migrations built. The counter defaults
 * the document does not state (`bursts.is_manual`, `item_views.open_count`,
 * `upload_sessions.file_count` and `total_bytes`,
 * `upload_files.attempt_count`, `outbound_emails.attempts`,
 * `pending_object_deletions.attempts`, all `0`) record what the migrations
 * chose, so changing one is a decision rather than a drift.
 *
 * Keep the columns in the order `data-models.md` gives them; the test compares
 * maps, so the order is for the reader.
 */
export const SCHEMA_MANIFEST = {
  members: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    email: { isNullable: false, type: "TEXT", defaultValue: null },
    display_name: { isNullable: true, type: "TEXT", defaultValue: null },
    role: { isNullable: false, type: "TEXT", defaultValue: "'viewer'" },
    status: { isNullable: false, type: "TEXT", defaultValue: "'invited'" },
    notify_on_upload: { isNullable: false, type: "INTEGER", defaultValue: "1" },
    notify_on_comment: {
      isNullable: false,
      type: "INTEGER",
      defaultValue: "1",
    },
    notify_on_reply: { isNullable: false, type: "INTEGER", defaultValue: "1" },
    notify_on_removal: {
      isNullable: false,
      type: "INTEGER",
      defaultValue: "1",
    },
    joined_at: { isNullable: true, type: "TEXT", defaultValue: null },
    last_signed_in_at: { isNullable: true, type: "TEXT", defaultValue: null },
    last_seen_at: { isNullable: true, type: "TEXT", defaultValue: null },
    removed_at: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  sign_in_codes: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    email: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: true, type: "TEXT", defaultValue: null },
    code_hash: { isNullable: false, type: "TEXT", defaultValue: null },
    attempts: { isNullable: false, type: "INTEGER", defaultValue: "0" },
    max_attempts: { isNullable: false, type: "INTEGER", defaultValue: "3" },
    expires_at: { isNullable: false, type: "TEXT", defaultValue: null },
    consumed_at: { isNullable: true, type: "TEXT", defaultValue: null },
    invalidated_at: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  sessions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    token_hash: { isNullable: false, type: "TEXT", defaultValue: null },
    device_label: { isNullable: false, type: "TEXT", defaultValue: null },
    user_agent: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    last_used_at: { isNullable: false, type: "TEXT", defaultValue: null },
    expires_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  invitations: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    invited_by_member_id: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    expires_at: { isNullable: false, type: "TEXT", defaultValue: null },
    send_count: { isNullable: false, type: "INTEGER", defaultValue: "1" },
    last_sent_at: { isNullable: false, type: "TEXT", defaultValue: null },
    revoked_at: { isNullable: true, type: "TEXT", defaultValue: null },
    accepted_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  groups: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    name: { isNullable: false, type: "TEXT", defaultValue: null },
    name_normalized: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  group_members: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    group_id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  visibility_rules: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    mode: { isNullable: false, type: "TEXT", defaultValue: null },
    subject_digest: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  visibility_rule_subjects: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    rule_id: { isNullable: false, type: "TEXT", defaultValue: null },
    subject_type: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: true, type: "TEXT", defaultValue: null },
    group_id: { isNullable: true, type: "TEXT", defaultValue: null },
  },
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
  comments: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    author_member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    body: { isNullable: false, type: "TEXT", defaultValue: null },
    at_seconds: { isNullable: true, type: "REAL", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    edited_at: { isNullable: true, type: "TEXT", defaultValue: null },
  },
  item_reactions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  comment_reactions: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    comment_id: { isNullable: false, type: "TEXT", defaultValue: null },
    member_id: { isNullable: false, type: "TEXT", defaultValue: null },
    kind: { isNullable: false, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
  },
  removal_requests: {
    id: { isNullable: false, type: "TEXT", defaultValue: null },
    item_id: { isNullable: true, type: "TEXT", defaultValue: null },
    requested_by_member_id: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    reason: { isNullable: true, type: "TEXT", defaultValue: null },
    state: { isNullable: false, type: "TEXT", defaultValue: null },
    decline_reason: { isNullable: true, type: "TEXT", defaultValue: null },
    created_at: { isNullable: false, type: "TEXT", defaultValue: null },
    resolved_at: { isNullable: true, type: "TEXT", defaultValue: null },
    resolved_by_member_id: {
      isNullable: true,
      type: "TEXT",
      defaultValue: null,
    },
    item_uploader_member_id: {
      isNullable: false,
      type: "TEXT",
      defaultValue: null,
    },
    item_captured_at: { isNullable: true, type: "TEXT", defaultValue: null },
    item_storage_key: { isNullable: true, type: "TEXT", defaultValue: null },
  },
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
} as const satisfies SchemaManifestShape;

/**
 * Every table in `Database`, mapping every one of its columns to what the
 * manifest has to record about it.
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
 * **`isNullable` is the load-bearing member and its type is the whole point.**
 * It is not `boolean`: it resolves per column to the literal `true` or `false`
 * that `Database` implies, so the manifest cannot disagree with the Kysely
 * type without failing to compile. Widening it to `boolean` would leave this
 * file asserting only that somebody wrote a boolean, which is the difference
 * between a tie and a formality. `type` and `defaultValue` ride alongside as
 * ordinary values, because `Database` says nothing about either: SQLite's
 * `INTEGER` and `REAL` both surface as `number`, and a default is invisible to
 * a row type. They are tied to the live database by the schema test instead.
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
    readonly [ColumnName in keyof Database[TableName] & string]: {
      readonly isNullable: null extends Database[TableName][ColumnName]
        ? true
        : false;
      readonly type: string;
      readonly defaultValue: string | null;
    };
  };
};
