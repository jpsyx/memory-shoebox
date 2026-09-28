import type { ForeignKeyInfo, IndexInfo } from "../introspect.ts";
import { indexColumns } from "./indexColumns.ts";

/** The tables migration 'identity and access' creates, as `Database` names them. */
type IdentityAndAccessTable =
  | "members"
  | "sign_in_codes"
  | "sessions"
  | "invitations"
  | "groups"
  | "group_members"
  | "visibility_rules"
  | "visibility_rule_subjects";

/** Every foreign key on a identity and access table. See `EXPECTED_FOREIGN_KEYS`. */
export const IDENTITY_AND_ACCESS_FOREIGN_KEYS: Record<
  IdentityAndAccessTable,
  ForeignKeyInfo[]
> = {
  // References nothing: every authorship key in the product points *at* this
  // table instead.
  members: [],
  sign_in_codes: [
    // CASCADE: a live code outliving its member is an authentication bypass.
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  sessions: [
    // CASCADE. Never fires; exists so shell surgery cannot leave a live
    // credential belonging to nobody.
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  invitations: [
    // The inviter is RESTRICT: the attribution is shown in an email that
    // survives forever. The invitee is CASCADE.
    {
      column: "invited_by_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  // A group is pure vocabulary; the membership rows below carry the keys.
  groups: [],
  group_members: [
    {
      column: "group_id",
      referencesTable: "groups",
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
  // A rule holds a mode and a digest and points at nothing; its subjects are
  // the table below.
  visibility_rules: [],
  visibility_rule_subjects: [
    // `group_id` is RESTRICT while `member_id` beside it is CASCADE, and the
    // asymmetry is a security boundary: cascading a group deletion out of an
    // `except` rule would widen access on every rule that excluded it.
    {
      column: "group_id",
      referencesTable: "groups",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "rule_id",
      referencesTable: "visibility_rules",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
};

/** Every declared index on a identity and access table. See `EXPECTED_INDEXES`. */
export const IDENTITY_AND_ACCESS_INDEXES: Record<
  IdentityAndAccessTable,
  IndexInfo[]
> = {
  members: [],
  sign_in_codes: [
    // `(email, created_at DESC)` serves both the rate-limit clock and the
    // "most recent code for this address" lookup.
    {
      name: "sign_in_codes_email_created",
      columns: indexColumns("email", "created_at desc"),
      isUnique: false,
    },
  ],
  sessions: [
    // The unique on `token_hash` is the hot path, hit on every authenticated
    // request including every thumbnail. Losing the `UNIQUE` would let two
    // sessions share one cookie value and still serve every request.
    {
      name: "sessions_expires",
      columns: indexColumns("expires_at"),
      isUnique: false,
    },
    {
      name: "sessions_member_last_used",
      columns: indexColumns("member_id", "last_used_at desc"),
      isUnique: false,
    },
    {
      name: "sessions_token_hash",
      columns: indexColumns("token_hash"),
      isUnique: true,
    },
  ],
  invitations: [],
  groups: [],
  group_members: [
    // "The second-hottest index in the product": visibility expansion reads
    // it on every timeline query and every count. It leads on `member_id`
    // precisely because the unique constraint on `(group_id, member_id)`
    // cannot serve a search that starts from the member.
    {
      name: "group_members_member_group",
      columns: indexColumns("member_id", "group_id"),
      isUnique: false,
    },
  ],
  visibility_rules: [
    // Deliberately **not** unique: deleting a member can make two previously
    // distinct rules collide on their digest, and tolerating an equivalent
    // duplicate is cheaper than merging them mid-transaction.
    {
      name: "visibility_rules_mode_digest",
      columns: indexColumns("mode", "subject_digest"),
      isUnique: false,
    },
  ],
  visibility_rule_subjects: [
    // Four: two partial uniques that enforce "no subject twice on a rule",
    // and two single-column sweeps that find. The partial pair cannot serve
    // the sweep, because each leads with `rule_id`. The uniqueness on the
    // pair is the whole point of them: the composite
    // `UNIQUE (rule_id, subject_type, member_id, group_id)` this replaced
    // rejected nothing, because one id column is always null and SQLite
    // counts distinct nulls as distinct.
    {
      name: "visibility_rule_subjects_group",
      columns: indexColumns("rule_id", "group_id"),
      isUnique: true,
    },
    {
      name: "visibility_rule_subjects_group_sweep",
      columns: indexColumns("group_id"),
      isUnique: false,
    },
    {
      name: "visibility_rule_subjects_member",
      columns: indexColumns("rule_id", "member_id"),
      isUnique: true,
    },
    {
      name: "visibility_rule_subjects_member_sweep",
      columns: indexColumns("member_id"),
      isUnique: false,
    },
  ],
};

/**
 * Every table-level `UNIQUE` on a identity and access table. See
 * `EXPECTED_UNIQUE_CONSTRAINTS`.
 */
export const IDENTITY_AND_ACCESS_UNIQUE_CONSTRAINTS: Record<
  IdentityAndAccessTable,
  string[][]
> = {
  // Global, and the identity itself: My account states the address can never
  // be changed. A removed member keeps their address claimed, which is what
  // makes re-inviting them reuse the row rather than insert a second.
  members: [["email"]],
  sign_in_codes: [],
  sessions: [],
  invitations: [],
  // Two groups called "Cousins" makes the visibility picker unusable and
  // there is no way to tell them apart in a chip.
  groups: [["name_normalized"]],
  // One member joins one group once. The `group_members_member_group` index
  // above cannot stand in for this: it is not unique.
  group_members: [["group_id", "member_id"]],
  visibility_rules: [],
  visibility_rule_subjects: [],
};
