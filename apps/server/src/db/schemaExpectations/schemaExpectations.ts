import type {
  ForeignKeyInfo,
  IndexInfo,
} from "../schemaIntrospectionHelpers.ts";
import type { Database } from "../types/db.types.ts";
import {
  CATALOG_FOREIGN_KEYS,
  CATALOG_INDEXES,
  CATALOG_UNIQUE_CONSTRAINTS,
} from "./catalog.ts";
import {
  IDENTITY_AND_ACCESS_FOREIGN_KEYS,
  IDENTITY_AND_ACCESS_INDEXES,
  IDENTITY_AND_ACCESS_UNIQUE_CONSTRAINTS,
} from "./identityAndAccess.ts";
import {
  MODERATION_FOREIGN_KEYS,
  MODERATION_INDEXES,
  MODERATION_UNIQUE_CONSTRAINTS,
} from "./moderation.ts";
import {
  OPERATIONS_FOREIGN_KEYS,
  OPERATIONS_INDEXES,
  OPERATIONS_UNIQUE_CONSTRAINTS,
} from "./operations.ts";
import {
  UPLOAD_FOREIGN_KEYS,
  UPLOAD_INDEXES,
  UPLOAD_UNIQUE_CONSTRAINTS,
} from "./upload.ts";

/**
 * Every foreign key, with the delete rule `data-models.md` names for it.
 *
 * This exists because a cascade is the one thing in a schema that is both
 * trivial to write wrong and invisible when it is: nothing fails until a
 * deletion takes something it should have left, and by then the row is gone.
 * Keyed by table, ordered by column, which is the order `readForeignKeys`
 * returns.
 *
 * Sixty-one keys across twenty-eight tables. The five tables with no key at
 * all are `members`, `groups`, `visibility_rules`, `email_suppressions` and
 * `pending_object_deletions`; they carry an explicit empty array here, and the
 * test asserts their absence separately too, because an invented relationship
 * on any of them would be as wrong as a missing one.
 *
 * **Keyed by `keyof Database`, not by `string`.** Do not let the test reach
 * this through `EXPECTED_FOREIGN_KEYS[tableName] ?? []`: the fallback turns a
 * typo'd or stale table name into a silently dead entry, asserting nothing at
 * all while looking like a promise. Keyed this way the compiler demands every
 * table and rejects any name that is not one, which is the same completeness
 * `SCHEMA_MANIFEST` gets from its mapped type.
 *
 * Transcribed from `data-models.md` rather than from the migrations, so that a
 * migration disagreeing with the document fails here. Where the document
 * leaves a rule unstated (`removal_requests.resolved_by_member_id` and
 * `item_uploader_member_id`, for instance) the entry records what migration
 * 0005 built, which is `RESTRICT` in line with every other authorship key.
 *
 * Table order follows `SCHEMA_MANIFEST`, which follows the document.
 *
 * Composed from one file per table group, split the way the migrations are.
 * The `Record<keyof Database, ...>` annotation is what keeps the composition
 * honest: dropping a group here is a missing-property error naming its first
 * table, not a quietly shorter record.
 */
export const EXPECTED_FOREIGN_KEYS: Record<keyof Database, ForeignKeyInfo[]> = {
  ...IDENTITY_AND_ACCESS_FOREIGN_KEYS,
  ...CATALOG_FOREIGN_KEYS,
  ...MODERATION_FOREIGN_KEYS,
  ...UPLOAD_FOREIGN_KEYS,
  ...OPERATIONS_FOREIGN_KEYS,
};

/**
 * Every index a migration declared, with the columns it covers, the direction
 * each one sorts in, and whether it is unique, per table.
 *
 * Implicit indexes are excluded by `readIndexes`, so this lists only what a
 * `CREATE INDEX` asked for. A table whose uniqueness lives in a table-level
 * `UNIQUE` constraint therefore shows fewer entries here than the document's
 * index list suggests, and four tables declare none at all: `members`,
 * `invitations`, `groups` and `tags`. Those four constraints are not
 * unasserted: `EXPECTED_UNIQUE_CONSTRAINTS` below carries them.
 *
 * Sixty-three indexes. An empty array is an assertion in its own right: it
 * says this table declares no index of its own, so adding one without updating
 * this record fails.
 *
 * **Columns, direction and uniqueness, not just names.** An earlier version of
 * this record held bare name strings, and a mutation test found that every
 * interesting index regression slipped through it: `items_seq` losing its
 * `UNIQUE`, `sessions_token_hash` losing its, and
 * `items_captured_on_rule_id` rebuilt on the wrong columns all kept their
 * names and so kept passing. A name asserts that somebody ran a
 * `CREATE INDEX`; the columns, the direction and the `UNIQUE` flag are the
 * parts that actually do the work. Direction was the last of the four to be
 * asserted, and it is not decoration: eight of these indexes are descending,
 * and `items_captured_on_rule_id` is the timeline's primary sort, so losing a
 * `DESC` there reverses the product's main screen while leaving the index's
 * name, columns and uniqueness untouched.
 *
 * Transcribed from `data-models.md` rather than from the migrations, for the
 * same reason as the foreign keys: a migration disagreeing with the document
 * has to fail here. That includes the directions: the document spells seven of
 * the eight `DESC` out, in its `sign_in_codes`, `sessions`, `items` and
 * `activity_events` index lists, and an index it lists without a keyword is
 * ascending. Seven indexes are not in the document's lists at all and are
 * marked as such below; the eighth `DESC`,
 * `item_capture_date_changes_item_changed`, is one of them, so its direction
 * records what migration 0003 built and what that migration's own comment
 * asks for, which is "newest first". Each of the seven
 * was added by a migration that recorded its own reasoning in a comment, and
 * the reasoning is repeated here so that removing one is a decision rather
 * than a tidy-up.
 *
 * Table order follows `SCHEMA_MANIFEST`. Names are sorted within a table,
 * which is the order `readIndexes` returns, and columns are in index order.
 *
 * Composed from one file per table group; see `EXPECTED_FOREIGN_KEYS`.
 */
export const EXPECTED_INDEXES: Record<keyof Database, IndexInfo[]> = {
  ...IDENTITY_AND_ACCESS_INDEXES,
  ...CATALOG_INDEXES,
  ...MODERATION_INDEXES,
  ...UPLOAD_INDEXES,
  ...OPERATIONS_INDEXES,
};

/**
 * Every table-level `UNIQUE` constraint, as the column lists the database
 * refuses to repeat.
 *
 * Four of this schema's uniques are written inside a `CREATE TABLE` rather
 * than as a `CREATE UNIQUE INDEX`, which makes them invisible to
 * `readIndexes` and, until this record existed, asserted nowhere at all.
 * SQLite enforces the two forms identically, so which form a migration
 * chooses is a matter of style; that they are enforced is not.
 *
 * Kept apart from `EXPECTED_INDEXES` rather than folded into it because the
 * only name SQLite gives these is one it invented,
 * `sqlite_autoindex_members_2`, whose trailing number counts autoindexes on
 * the table and so moves when a migration reorders two constraint lines.
 * Recording column lists asserts the thing that matters and nothing that does
 * not. See `readUniqueConstraints`.
 *
 * Every table is listed, twenty-nine of them with an empty array, so that a
 * `UNIQUE` appearing on a table that should not have one fails here too.
 * Column lists are sorted, which is the order `readUniqueConstraints` returns.
 *
 * Composed from one file per table group; see `EXPECTED_FOREIGN_KEYS`.
 */
export const EXPECTED_UNIQUE_CONSTRAINTS: Record<keyof Database, string[][]> = {
  ...IDENTITY_AND_ACCESS_UNIQUE_CONSTRAINTS,
  ...CATALOG_UNIQUE_CONSTRAINTS,
  ...MODERATION_UNIQUE_CONSTRAINTS,
  ...UPLOAD_UNIQUE_CONSTRAINTS,
  ...OPERATIONS_UNIQUE_CONSTRAINTS,
};
