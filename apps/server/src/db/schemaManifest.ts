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
