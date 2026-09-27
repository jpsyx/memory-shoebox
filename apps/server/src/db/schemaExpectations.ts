import type { ForeignKeyInfo, IndexColumn, IndexInfo } from "./introspect.ts";
import type { Database } from "./types.ts";

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
 * **Keyed by `keyof Database`, not by `string`.** The test used to read this
 * as `EXPECTED_FOREIGN_KEYS[tableName] ?? []`, which meant a typo'd or stale
 * table name was a silently dead entry asserting nothing at all while looking
 * like a promise. The compiler now demands every table and rejects any name
 * that is not one, which is the same completeness `SCHEMA_MANIFEST` gets from
 * its mapped type.
 *
 * Transcribed from `data-models.md` rather than from the migrations, so that a
 * migration disagreeing with the document fails here. Where the document
 * leaves a rule unstated (`removal_requests.resolved_by_member_id` and
 * `item_uploader_member_id`, for instance) the entry records what migration
 * 0005 built, which is `RESTRICT` in line with every other authorship key.
 *
 * Table order follows `SCHEMA_MANIFEST`, which follows the document.
 */
export const EXPECTED_FOREIGN_KEYS: Record<keyof Database, ForeignKeyInfo[]> = {
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
  items: [
    // `burst_id` SET NULL: dissolving a burst leaves forty-five prints
    // standing. `upload_session_id` SET NULL: purging old sessions must not
    // endanger photographs. `visibility_rule_id` RESTRICT: an item with no
    // rule has undefined visibility, which fails open.
    {
      column: "burst_id",
      referencesTable: "bursts",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "uploaded_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "visibility_rule_id",
      referencesTable: "visibility_rules",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
  item_renditions: [
    // CASCADE, plus an object delete per row. The only cascade with a side
    // effect outside the database.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  bursts: [
    // `upload_session_id` is RESTRICT here and SET NULL on `items`, which
    // `data-models.md` flags as an unresolved contradiction that whoever
    // implements session purging has to settle. Asserted as built and as
    // specified, so the day it is settled this line has to change on purpose.
    {
      column: "cover_item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
  milestones: [
    // SET NULL: a milestone is a family fact that outlives whoever typed it.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  item_milestones: [
    // CASCADE on `milestone_id` is the delete dialog's own promise: the
    // occasion goes, the 212 photographs stay. It removes join rows only, and
    // a cascade in the other direction would be the most damaging bug the
    // product could ship.
    {
      column: "attached_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "milestone_id",
      referencesTable: "milestones",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  item_capture_date_changes: [
    {
      column: "changed_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "milestone_id",
      referencesTable: "milestones",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  tags: [
    // `tags` does have a foreign key, which is easy to miss because the table
    // is otherwise pure vocabulary.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  item_tags: [
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "tag_id",
      referencesTable: "tags",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "tagged_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  people: [
    // All three SET NULL. The member link goes on `people` rather than on
    // `members`, because the person record long predates the member record
    // and may never get one.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "preferred_face_item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  item_people: [
    // RESTRICT on `person_id` differs from `item_tags` on purpose: deleting a
    // person would silently strip them from hundreds of photographs with no
    // undo, and the removal-request flow depends on knowing who is in one.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "person_id",
      referencesTable: "people",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "tagged_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
  ],
  comments: [
    // RESTRICT on the author is the opposite choice for the opposite reason:
    // cascading would let removing one relative silently erase a decade of
    // the family's conversation on photographs that stay up.
    {
      column: "author_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  item_reactions: [
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
  comment_reactions: [
    // The transitive cascade a polymorphic reactions table could not have
    // given: deleting an item takes its comments and their reactions.
    {
      column: "comment_id",
      referencesTable: "comments",
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
  removal_requests: [
    // SET NULL on `item_id` is the one exception in the cascade matrix, so
    // takedown history survives the takedown. The three member keys are
    // RESTRICT; the document states it for the asker and leaves the other two
    // unstated, and migration 0005 matched the asker.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "item_uploader_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "requested_by_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "resolved_by_member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
  upload_sessions: [
    {
      column: "uploaded_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "visibility_rule_id",
      referencesTable: "visibility_rules",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
  ],
  upload_files: [
    // SET NULL on `item_id`: deleting a photograph later must not erase the
    // record that a file arrived, since the upload history is the only place
    // the original filename and the transfer outcome live.
    {
      column: "item_id",
      referencesTable: "items",
      referencesColumn: "id",
      onDelete: "SET NULL",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  upload_batch_edits: [
    // The three subject columns take different rules and the difference is
    // deliberate: `milestone_id` CASCADE because deleting a milestone is
    // promised to block on nothing, `tag_id` and `person_id` RESTRICT because
    // neither carries a snapshot to fall back on once nulled.
    {
      column: "created_by",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "milestone_id",
      referencesTable: "milestones",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "person_id",
      referencesTable: "people",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "tag_id",
      referencesTable: "tags",
      referencesColumn: "id",
      onDelete: "RESTRICT",
    },
    {
      column: "upload_session_id",
      referencesTable: "upload_sessions",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  upload_batch_edit_targets: [
    {
      column: "upload_batch_edit_id",
      referencesTable: "upload_batch_edits",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "upload_file_id",
      referencesTable: "upload_files",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  // A storage key whose row is already gone, so there is nothing left to
  // reference.
  pending_object_deletions: [],
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

/**
 * One index's columns, written the way `data-models.md` writes them.
 *
 * `indexColumns("captured_on desc", "visibility_rule_id", "id")` transcribes
 * the document's `(captured_on DESC, visibility_rule_id, id)` one for one. A
 * bare name is ascending, which is both SQLite's default and what the
 * document's silence means.
 *
 * A helper rather than sixty-three hand-written object literals, because what
 * a reader checks against the document is the tuple, and an object per column
 * buries it. Anything other than an exact `" desc"` suffix throws while this
 * module loads, so a mistyped direction is a test that cannot start rather
 * than a column quietly asserting ascending.
 */
function indexColumns(
  ...declarations: readonly string[]
): readonly IndexColumn[] {
  return declarations.map((declaration) => {
    const [name, keyword, ...rest] = declaration.split(" ");
    if (name === undefined || name === "" || rest.length > 0) {
      throw new Error(`Unreadable index column: "${declaration}"`);
    }
    if (keyword === undefined) {
      return { name, direction: "asc" } satisfies IndexColumn;
    }
    if (keyword !== "desc") {
      throw new Error(`Unknown index column direction: "${declaration}"`);
    }
    return { name, direction: "desc" } satisfies IndexColumn;
  });
}

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
 */
export const EXPECTED_INDEXES: Record<keyof Database, IndexInfo[]> = {
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
  items: [
    // `items_captured_on_rule_id` is the timeline's covering index and its
    // column order is load-bearing: the group-by runs in index order, the
    // visibility filter is checked inside the index, and a `LIMIT 30` stops
    // early without touching the table. Rebuilt on any other columns it
    // would still exist, still be named the same, and stop covering.
    // `items_rule_captured_on` is its mirror, kept so the planner can choose.
    {
      name: "items_burst_index",
      columns: indexColumns("burst_id", "burst_index"),
      isUnique: false,
    },
    {
      name: "items_captured_on_rule_id",
      columns: indexColumns("captured_on desc", "visibility_rule_id", "id"),
      isUnique: false,
    },
    {
      name: "items_rule_captured_on",
      columns: indexColumns("visibility_rule_id", "captured_on"),
      isUnique: false,
    },
    // UNIQUE, because `seq` is the monotonic arrival order the unseen
    // comparisons read. Two items sharing a `seq` makes that comparison
    // ambiguous and nothing else notices.
    {
      name: "items_seq",
      columns: indexColumns("seq"),
      isUnique: true,
    },
    {
      name: "items_session_captured",
      columns: indexColumns("upload_session_id", "captured_on", "captured_at"),
      isUnique: false,
    },
    {
      name: "items_uploaded_by",
      columns: indexColumns("uploaded_by"),
      isUnique: false,
    },
  ],
  item_renditions: [
    // Both unique, so a double upload cannot point two rows at one object and
    // make deletion ambiguous.
    {
      name: "item_renditions_item_purpose",
      columns: indexColumns("item_id", "purpose"),
      isUnique: true,
    },
    {
      name: "item_renditions_storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
  bursts: [
    // Not in the document's index list. Migration 0003 added it so that
    // dissolving a burst, which fires `ON DELETE SET NULL` on every cover
    // reference, does not scan the whole table.
    {
      name: "bursts_cover_item",
      columns: indexColumns("cover_item_id"),
      isUnique: false,
    },
    // Not in the document's index list either. Migration 0008 added it for the
    // same reason one migration later than it should have been: the
    // `upload_session_id` RESTRICT still has to look before it refuses, so a
    // session purge without this scans every burst.
    {
      name: "bursts_upload_session",
      columns: indexColumns("upload_session_id"),
      isUnique: false,
    },
  ],
  milestones: [
    // For the overlap predicate. Not unique, and the document says why: two
    // "Mateo's birthday" milestones a year apart are both correct.
    {
      name: "milestones_span",
      columns: indexColumns("starts_on", "ends_on"),
      isUnique: false,
    },
  ],
  item_milestones: [
    {
      name: "item_milestones_item_milestone",
      columns: indexColumns("item_id", "milestone_id"),
      isUnique: true,
    },
    {
      name: "item_milestones_milestone_item",
      columns: indexColumns("milestone_id", "item_id"),
      isUnique: false,
    },
  ],
  item_capture_date_changes: [
    // Not in the document's index list. Migration 0003 added it for the audit
    // trail's own read, which is "this item's changes, newest first".
    {
      name: "item_capture_date_changes_item_changed",
      columns: indexColumns("item_id", "changed_at desc"),
      isUnique: false,
    },
    // Not in the document's index list. Migration 0008 added it because the
    // `milestone_id` SET NULL fires on a milestone delete the API promises
    // nothing blocks, against a table that grows with the archive, and the
    // index above leads with `item_id` and so cannot serve it. Partial: only a
    // `milestone_reconcile` row carries a milestone at all.
    {
      name: "item_capture_date_changes_milestone",
      columns: indexColumns("milestone_id"),
      isUnique: false,
    },
  ],
  tags: [],
  item_tags: [
    // Indexed both ways so a multi-filter query can drive from whichever
    // predicate is most selective. Only the forward direction is unique.
    {
      name: "item_tags_item_tag",
      columns: indexColumns("item_id", "tag_id"),
      isUnique: true,
    },
    {
      name: "item_tags_tag_item",
      columns: indexColumns("tag_id", "item_id"),
      isUnique: false,
    },
  ],
  people: [
    // The partial unique that stops two person records claiming one account,
    // without stopping many people from having no account at all.
    {
      name: "people_member",
      columns: indexColumns("member_id"),
      isUnique: true,
    },
  ],
  item_people: [
    {
      name: "item_people_item_person",
      columns: indexColumns("item_id", "person_id"),
      isUnique: true,
    },
    {
      name: "item_people_person_item",
      columns: indexColumns("person_id", "item_id"),
      isUnique: false,
    },
  ],
  comments: [
    // Covers both the read and the ordering.
    {
      name: "comments_item_created_at",
      columns: indexColumns("item_id", "created_at"),
      isUnique: false,
    },
  ],
  item_reactions: [
    // One member's single reaction to one item, which is what the unique
    // says. Without it the toggle becomes an append.
    {
      name: "item_reactions_item_member",
      columns: indexColumns("item_id", "member_id"),
      isUnique: true,
    },
  ],
  comment_reactions: [
    {
      name: "comment_reactions_comment_member",
      columns: indexColumns("comment_id", "member_id"),
      isUnique: true,
    },
  ],
  removal_requests: [
    // `__one_open_per_asker` is the partial unique: one person cannot have
    // two open requests on one photograph, but a declined request still
    // offers "Ask again".
    {
      name: "removal_requests__by_item",
      columns: indexColumns("item_id"),
      isUnique: false,
    },
    {
      name: "removal_requests__by_state",
      columns: indexColumns("state", "created_at"),
      isUnique: false,
    },
    {
      name: "removal_requests__one_open_per_asker",
      columns: indexColumns("item_id", "requested_by_member_id"),
      isUnique: true,
    },
    {
      name: "removal_requests__open_by_uploader",
      columns: indexColumns("item_uploader_member_id", "state", "created_at"),
      isUnique: false,
    },
  ],
  upload_sessions: [
    // "This member's non-terminal session", which is the leading-column
    // shape both the current-session read and the conflict check want.
    {
      name: "upload_sessions__by_uploader_state",
      columns: indexColumns("uploaded_by", "state"),
      isUnique: false,
    },
  ],
  upload_files: [
    // `__session_content_hash` is unique so a retry is idempotent: lose the
    // `UNIQUE` and a re-sent file becomes a second row and a second item.
    // `__storage_key` is unique so one object belongs to one file across the
    // whole deployment.
    //
    // `__by_item` is not in the document's index list. Migration 0006 added
    // it for the same reason as `bursts_cover_item`: deleting an item fires
    // `ON DELETE SET NULL` here and would otherwise scan every file row.
    {
      name: "upload_files__by_item",
      columns: indexColumns("item_id"),
      isUnique: false,
    },
    {
      name: "upload_files__session_content_hash",
      columns: indexColumns("upload_session_id", "content_hash"),
      isUnique: true,
    },
    {
      name: "upload_files__session_position",
      columns: indexColumns("upload_session_id", "position"),
      isUnique: true,
    },
    {
      name: "upload_files__session_state",
      columns: indexColumns("upload_session_id", "state"),
      isUnique: false,
    },
    {
      name: "upload_files__storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
  upload_batch_edits: [
    // Not in the document's index list. Migration 0006 added it for the
    // "What you have added" list, which reads one session's edits in the
    // order they were made.
    {
      name: "upload_batch_edits__by_session",
      columns: indexColumns("upload_session_id", "created_at"),
      isUnique: false,
    },
  ],
  upload_batch_edit_targets: [
    // Unique on the pair, plus an index on the file alone, because ingest
    // runs the other way round: it asks what applies to this file.
    {
      name: "upload_batch_edit_targets__by_file",
      columns: indexColumns("upload_file_id"),
      isUnique: false,
    },
    {
      name: "upload_batch_edit_targets__edit_file",
      columns: indexColumns("upload_batch_edit_id", "upload_file_id"),
      isUnique: true,
    },
  ],
  pending_object_deletions: [
    // UNIQUE: enqueuing one key twice would have the drain delete an object
    // that a later item legitimately reused.
    {
      name: "pending_object_deletions__storage_key",
      columns: indexColumns("storage_key"),
      isUnique: true,
    },
  ],
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
 */
export const EXPECTED_UNIQUE_CONSTRAINTS: Record<keyof Database, string[][]> = {
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
  items: [],
  item_renditions: [],
  bursts: [],
  milestones: [],
  item_milestones: [],
  item_capture_date_changes: [],
  // Free text, normalised on write, so "Hospital" and "hospital" must not
  // become two tags.
  tags: [["name_normalized"]],
  item_tags: [],
  people: [],
  item_people: [],
  comments: [],
  item_reactions: [],
  comment_reactions: [],
  removal_requests: [],
  upload_sessions: [],
  upload_files: [],
  upload_batch_edits: [],
  upload_batch_edit_targets: [],
  pending_object_deletions: [],
  settings: [],
  outbound_emails: [],
  email_delivery_events: [],
  email_suppressions: [],
  item_views: [],
  activity_events: [],
};
