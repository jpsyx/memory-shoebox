/** One invited address, for the life of the Shoebox. Never hard-deleted. */
export type MembersTable = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  notify_on_upload: number;
  notify_on_comment: number;
  notify_on_reply: number;
  notify_on_removal: number;
  joined_at: string | null;
  last_signed_in_at: string | null;
  last_seen_at: string | null;
  removed_at: string | null;
  created_at: string;
};

/**
 * One six-digit sign-in code, stored as `HMAC-SHA256(digits, server_pepper)`.
 *
 * A row is written even for an address that is not a member, so that an
 * unknown address is indistinguishable from a known one: `member_id` is null
 * when nothing was mailed.
 */
export type SignInCodesTable = {
  id: string;
  email: string;
  member_id: string | null;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  invalidated_at: string | null;
  created_at: string;
};

/**
 * One signed-in device. Named for its lifetime: the row appears at sign-in,
 * vanishes on sign-out, and falls out at 30 days idle.
 */
export type SessionsTable = {
  id: string;
  member_id: string;
  token_hash: string;
  device_label: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
};

/**
 * One invitation email. It carries no credential: acceptance is the first
 * successful sign-in at the invited address, and `members.status` alone
 * decides whether an address may sign in.
 */
export type InvitationsTable = {
  id: string;
  member_id: string;
  invited_by_member_id: string;
  created_at: string;
  expires_at: string;
  send_count: number;
  last_sent_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
};

/** A named set of members, used as a visibility subject. */
export type GroupsTable = {
  id: string;
  name: string;
  name_normalized: string;
  created_at: string;
};

/** One member's membership of one group. */
export type GroupMembersTable = {
  id: string;
  group_id: string;
  member_id: string;
  created_at: string;
};

/**
 * One visibility decision, shared by every item that made it.
 *
 * The rule is hoisted out of the item because one upload is one decision over
 * hundreds of files, so the archive holds tens of distinct rules rather than
 * one per item. Every archive query then carries an indexed
 * `visibility_rule_id IN (:visible)` instead of a correlated `EXISTS` per row,
 * which is what lets a count and the page it heads use the identical
 * predicate.
 *
 * Rules are immutable from the product's edit path: changing one item's
 * visibility points it at a different rule, because the rule is shared.
 */
export type VisibilityRulesTable = {
  id: string;
  mode: string;
  subject_digest: string;
  created_at: string;
};

/**
 * One member or one group named by one rule. Exactly one of `member_id` and
 * `group_id` is set, and it agrees with `subject_type`.
 */
export type VisibilityRuleSubjectsTable = {
  id: string;
  rule_id: string;
  subject_type: string;
  member_id: string | null;
  group_id: string | null;
};

/**
 * One photograph or one video: the atom the whole archive is built from.
 *
 * There is deliberately **no `deleted_at`**. The spec forbids a hidden flag in
 * three separate places, so a delete is a delete.
 *
 * `width` and `height` are **display** dimensions, after EXIF orientation has
 * been applied. Storing the raw EXIF pair on a portrait phone photograph that
 * carries an orientation flag gives the pile a landscape box with a rotated
 * image inside it, and the pile crops nothing, so the proportions are
 * load-bearing rather than cosmetic.
 */
export type ItemsTable = {
  id: string;
  kind: string;
  captured_at: string;
  captured_at_offset_minutes: number | null;
  captured_on: string;
  capture_source: string;
  original_captured_at: string;
  seq: number;
  uploaded_by: string;
  upload_session_id: string | null;
  visibility_rule_id: string;
  burst_id: string | null;
  burst_index: number | null;
  width: number;
  height: number;
  duration_ms: number | null;
  byte_size: number;
  content_type: string;
  checksum: string | null;
  original_filename: string | null;
  alt_text: string | null;
  created_at: string;
};

/**
 * One stored object belonging to one item: the original, the display copy, the
 * thumbnail, a video poster, or a transcode.
 *
 * A child table rather than six widening nullable columns on `items`, because
 * a video has five or six keys and a photograph has three.
 *
 * **These are storage keys, not URLs.** A URL is a short-lived signed thing
 * minted at render, and one batched query per page fetches the keys for every
 * print on it.
 */
export type ItemRenditionsTable = {
  id: string;
  item_id: string;
  purpose: string;
  storage_key: string;
  content_type: string;
  byte_size: number;
  width: number;
  height: number;
};

/**
 * One run of frames shot in a single burst, detected once at settle.
 *
 * **No `frame_count`, and that is not an oversight.** Visibility is per item,
 * so a burst can be partially visible and a stored count would be the
 * unfiltered one, leaking restricted frames through a denominator in exactly
 * the way the counting rule forbids for a day total. Both the frame count and
 * the span come from the visibility-filtered sibling query.
 *
 * Deleting the last frame of a burst must drop the burst row. No foreign key
 * direction does that, so it is a step in the delete transaction.
 */
export type BurstsTable = {
  id: string;
  upload_session_id: string;
  captured_on: string;
  starts_at: string;
  ends_at: string;
  detector_version: number | null;
  threshold_seconds: number | null;
  detected_at: string;
  is_manual: number;
  cover_item_id: string | null;
};

/**
 * One named occasion spanning one or more days.
 *
 * **A milestone has no visibility of its own**, deliberately: the occasion and
 * its name are visible to everybody and only its photographs are restricted.
 * Hiding an occasion whose visible item count is zero would make attaching one
 * restricted photograph to a previously empty occasion erase that occasion from
 * everybody else's timeline (Decision 5).
 *
 * `ends_on` is inclusive and equals `starts_on` for a one-day occasion, never
 * null. That one shape *is* the span model, and a nullable `ends_on` would
 * force every helper and every caller to branch.
 */
export type MilestonesTable = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  blurb: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * One photograph attached to one occasion.
 *
 * An item may be attached to a milestone whose span does not contain it, which
 * forces two things apart that look like one: a milestone's **item set** is
 * this table and never a date range, and a milestone's **day set** is the date
 * range and never this table.
 *
 * `span_mismatch_acknowledged_at` exists because the reconciliation flow offers
 * "Leave them as they are" as a real choice. Without it every visit re-offers
 * the same fix for the same photographs and a considered decision becomes a nag.
 */
export type ItemMilestonesTable = {
  id: string;
  item_id: string;
  milestone_id: string;
  attached_by: string | null;
  attached_at: string;
  span_mismatch_acknowledged_at: string | null;
};

/**
 * The audit trail for the one destructive metadata edit in the product.
 *
 * One row per **moved item**, never one row per change: a single row saying 34
 * items moved cannot be reverted per item, and this table is what makes "revert
 * that" mean something. `items.original_captured_at` is never written by any of
 * these paths, so "revert to what the file said" stays one step away however
 * many times a date is moved (Decision 10).
 */
export type ItemCaptureDateChangesTable = {
  id: string;
  item_id: string;
  milestone_id: string | null;
  previous_captured_at: string;
  previous_capture_date: string;
  previous_capture_source: string;
  new_captured_at: string;
  new_capture_date: string;
  changed_by: string;
  changed_at: string;
  reason: string;
};

/** One free-text label. `name_normalized` is what stops "Hospital" twice. */
export type TagsTable = {
  id: string;
  name: string;
  name_normalized: string;
  created_by: string | null;
  created_at: string;
};

/** One tag on one item. */
export type ItemTagsTable = {
  id: string;
  item_id: string;
  tag_id: string;
  tagged_by: string | null;
  tagged_at: string;
};

/**
 * One person who appears in photographs, whether or not they hold an account.
 *
 * **The link to an account goes here, not on `members`**: the person record
 * long predates the member record and may never get one, linking later is a
 * single `UPDATE people SET member_id = ?` that moves no tagging history, and
 * the partial unique index on `member_id` is what stops two person records
 * claiming one account.
 *
 * `preferred_face_item_id` is a hint, not an answer: the directory's face must
 * resolve at read time to an item the viewer can see.
 */
export type PeopleTable = {
  id: string;
  display_name: string;
  member_id: string | null;
  preferred_face_item_id: string | null;
  created_by: string | null;
  created_at: string;
};

/** One person tagged in one item. */
export type ItemPeopleTable = {
  id: string;
  item_id: string;
  person_id: string;
  tagged_by: string | null;
  tagged_at: string;
};

/**
 * The SQLite schema as Kysely sees it: one property per table, mapping the
 * table name to the shape of a row. Every table added by a migration under
 * `src/db/migrations/` gets a matching entry here, and Kysely then type-checks
 * every query against it.
 */
export type Database = {
  members: MembersTable;
  sign_in_codes: SignInCodesTable;
  sessions: SessionsTable;
  invitations: InvitationsTable;
  groups: GroupsTable;
  group_members: GroupMembersTable;
  visibility_rules: VisibilityRulesTable;
  visibility_rule_subjects: VisibilityRuleSubjectsTable;
  items: ItemsTable;
  item_renditions: ItemRenditionsTable;
  bursts: BurstsTable;
  milestones: MilestonesTable;
  item_milestones: ItemMilestonesTable;
  item_capture_date_changes: ItemCaptureDateChangesTable;
  tags: TagsTable;
  item_tags: ItemTagsTable;
  people: PeopleTable;
  item_people: ItemPeopleTable;
};
