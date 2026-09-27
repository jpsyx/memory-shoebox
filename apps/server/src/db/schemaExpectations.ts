import type { ForeignKeyInfo } from "./introspect.ts";

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
 * `pending_object_deletions`; the test asserts their absence too, because an
 * invented relationship on any of them would be as wrong as a missing one.
 *
 * Transcribed from `data-models.md` rather than from the migrations, so that a
 * migration disagreeing with the document fails here. Where the document
 * leaves a rule unstated (`removal_requests.resolved_by_member_id` and
 * `item_uploader_member_id`, for instance) the entry records what migration
 * 0005 built, which is `RESTRICT` in line with every other authorship key.
 *
 * Table order follows `SCHEMA_MANIFEST`, which follows the document.
 */
export const EXPECTED_FOREIGN_KEYS: Record<string, ForeignKeyInfo[]> = {
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
 * Every index a migration declared, by name, per table.
 *
 * Implicit indexes are excluded by `readIndexes`, so this lists only what a
 * `CREATE INDEX` asked for. A table whose uniqueness lives in a table-level
 * `UNIQUE` constraint therefore shows fewer entries here than the document's
 * index list suggests, and four tables declare none at all: `members`,
 * `invitations`, `groups` and `tags`.
 *
 * Sixty-one indexes. An empty array is an assertion in its own right: it says
 * this table declares no index of its own, so adding one without updating
 * this record fails.
 *
 * Table order follows `SCHEMA_MANIFEST`. Names are sorted within a table,
 * which is the order `readIndexes` returns.
 */
export const EXPECTED_INDEXES: Record<string, string[]> = {
  members: [],
  sign_in_codes: ["sign_in_codes_email_created"],
  sessions: [
    "sessions_expires",
    "sessions_member_last_used",
    "sessions_token_hash",
  ],
  invitations: [],
  groups: [],
  group_members: ["group_members_member_group"],
  visibility_rules: ["visibility_rules_mode_digest"],
  visibility_rule_subjects: [
    // Four: two partial uniques that enforce "no subject twice on a rule",
    // and two single-column sweeps that find. The partial pair cannot serve
    // the sweep, because each leads with `rule_id`.
    "visibility_rule_subjects_group",
    "visibility_rule_subjects_group_sweep",
    "visibility_rule_subjects_member",
    "visibility_rule_subjects_member_sweep",
  ],
  items: [
    "items_burst_index",
    "items_captured_on_rule_id",
    "items_rule_captured_on",
    "items_seq",
    "items_session_captured",
    "items_uploaded_by",
  ],
  item_renditions: [
    "item_renditions_item_purpose",
    "item_renditions_storage_key",
  ],
  bursts: ["bursts_cover_item"],
  milestones: ["milestones_span"],
  item_milestones: [
    "item_milestones_item_milestone",
    "item_milestones_milestone_item",
  ],
  item_capture_date_changes: ["item_capture_date_changes_item_changed"],
  tags: [],
  item_tags: ["item_tags_item_tag", "item_tags_tag_item"],
  people: ["people_member"],
  item_people: ["item_people_item_person", "item_people_person_item"],
  comments: ["comments_item_created_at"],
  item_reactions: ["item_reactions_item_member"],
  comment_reactions: ["comment_reactions_comment_member"],
  removal_requests: [
    "removal_requests__by_item",
    "removal_requests__by_state",
    "removal_requests__one_open_per_asker",
    "removal_requests__open_by_uploader",
  ],
  upload_sessions: ["upload_sessions__by_uploader_state"],
  upload_files: [
    "upload_files__by_item",
    "upload_files__session_content_hash",
    "upload_files__session_position",
    "upload_files__session_state",
    "upload_files__storage_key",
  ],
  upload_batch_edits: ["upload_batch_edits__by_session"],
  upload_batch_edit_targets: [
    "upload_batch_edit_targets__by_file",
    "upload_batch_edit_targets__edit_file",
  ],
  pending_object_deletions: ["pending_object_deletions__storage_key"],
  settings: ["settings__one_instance_value", "settings__one_member_value"],
  outbound_emails: [
    "outbound_emails__idempotency_key",
    "outbound_emails__state_created",
    "outbound_emails__state_next_attempt",
  ],
  email_delivery_events: ["email_delivery_events__email_event_occurred"],
  email_suppressions: ["email_suppressions__address"],
  item_views: [
    "item_views__item_member",
    "item_views__member_item",
    "item_views__opened_by_item",
    "item_views__opened_by_member",
  ],
  activity_events: [
    "activity_events__actor_occurred",
    "activity_events__by_device",
    "activity_events__kind_occurred",
    "activity_events__occurred",
    "activity_events__subject_occurred",
  ],
};
