import type { SchemaManifestShape } from "./schemaManifest.ts";

/**
 * The identity and access tables' half of `SCHEMA_MANIFEST`.
 *
 * The local `satisfies Pick<SchemaManifestShape, ...>` is what keeps a
 * column mistake an error at the column: without it the whole composition
 * fails as one `TS1360` at the entry point instead.
 */
export const IDENTITY_AND_ACCESS_MANIFEST = {
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
} as const satisfies Pick<
  SchemaManifestShape,
  | "members"
  | "sign_in_codes"
  | "sessions"
  | "invitations"
  | "groups"
  | "group_members"
  | "visibility_rules"
  | "visibility_rule_subjects"
>;
