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
 * One comment on one item, optionally pinned to a moment in a video.
 *
 * **No visibility column.** A comment inherits its item's rule exactly, and
 * copying it here would be a second source of truth that can drift.
 *
 * **No `parent_comment_id`.** The thread is flat in both surfaces. The
 * notification line "a reply on something you posted or commented on" means
 * another top-level comment on the same item, not threading.
 *
 * `edited_at` is not optional decoration: it is what the **edited** marker
 * reads off, and a comment that changes under a reader with no sign of it is
 * worse than one that cannot change at all (Decision 8).
 *
 * `at_seconds` is a float rather than an integer because the scrubber produces
 * `fraction * duration`. It is null except on a comment pinned to a moment.
 */
export type CommentsTable = {
  id: string;
  item_id: string;
  author_member_id: string;
  body: string;
  at_seconds: number | null;
  created_at: string;
  edited_at: string | null;
};

/**
 * One member's single reaction to one item.
 *
 * `UNIQUE (item_id, member_id)` is the whole of "one per member per thing":
 * changing a reaction is `INSERT ... ON CONFLICT DO UPDATE SET kind =
 * excluded.kind` and pressing your own again is a `DELETE`.
 *
 * **No stored count anywhere.** A reaction total is a per-viewer aggregate
 * like every other count in the product, and the rows are returned rather than
 * summed: the popover needs the names anyway.
 */
export type ItemReactionsTable = {
  id: string;
  item_id: string;
  member_id: string;
  kind: string;
  created_at: string;
};

/**
 * One member's single reaction to one comment.
 *
 * Identical to `item_reactions` but for its parent, and **deliberately not
 * merged with it** into one polymorphic table. SQLite cannot declare a foreign
 * key against two tables, so a polymorphic reactions table would have no
 * cascade at all: an orphaned reaction renders nothing and alerts nobody. Two
 * tables buy engine-enforced cleanup for the price of one duplicated
 * four-column table.
 */
export type CommentReactionsTable = {
  id: string;
  comment_id: string;
  member_id: string;
  kind: string;
  created_at: string;
};

/**
 * One request that a photograph come down, and the record of how it was
 * settled.
 *
 * `item_id` is `SET NULL`, the one exception to cascade in the whole schema:
 * the commonest way a request ends is that somebody deletes the item, and a
 * `CASCADE` would destroy the request in exactly the case where the record
 * matters most. The three `item_*` columns are a snapshot taken at request
 * time so a settled request still renders with nothing left to join to, and
 * `item_uploader_member_id` in particular is what the uploader's queue scopes
 * by, never a join to `items`, or a deleted item would drop it from their own
 * resolved history.
 *
 * `(state = 'open') = (resolved_at IS NULL)` is an equivalence, not an
 * implication: it is what makes a request resolve exactly once, enforced by
 * the database rather than by a handler. A decline additionally always
 * carries a `decline_reason`, unlike the free-form `reason` on the request
 * itself.
 */
export type RemovalRequestsTable = {
  id: string;
  item_id: string | null;
  requested_by_member_id: string;
  reason: string | null;
  state: string;
  decline_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_member_id: string | null;
  item_uploader_member_id: string;
  item_captured_at: string | null;
  item_storage_key: string | null;
};

/**
 * One batch of files, from the moment the uploader opens the surface to the
 * moment the notification goes out.
 *
 * First-class because the notification is keyed to it, because it is the
 * resume unit, and because the done state reports on it as an object.
 *
 * `visibility_rule_id` is one rule for the whole batch, copied onto each item
 * at ingest and never referenced through the session: editing one
 * photograph's visibility a month later must not silently change the other
 * 263.
 *
 * `client_timezone` is a **diagnostic column only**. Nothing resolves against
 * it: an offset-less capture date resolves in `shoebox.timezone`, because the
 * day a photograph lands on must not depend on where the uploader was
 * standing (Decision 10).
 *
 * **No `done_count`, `failed_count` or `bytes_transferred`.** All three are a
 * `GROUP BY state` over at most a few hundred rows on a covering index, and
 * denormalising them invites drift on the surface where a wrong count is most
 * visible. `file_count` and `total_bytes` are not those: they are the figures
 * the batch committed to, frozen at commit.
 */
export type UploadSessionsTable = {
  id: string;
  uploaded_by: string;
  state: string;
  visibility_rule_id: string;
  file_count: number;
  total_bytes: number;
  client_timezone: string;
  created_at: string;
  committed_at: string | null;
  last_activity_at: string;
  settled_at: string | null;
  notified_at: string | null;
  notified_member_count: number | null;
};

/**
 * One file in a batch: the per-file state machine, and the manifest row that
 * makes the batch resumable.
 *
 * **Separate from `items` on purpose.** A refused PDF and a file that never
 * arrived are never items, and an `items.state = 'pending'` would put
 * `AND state = 'ready'` into every read query in the product, where one
 * missed predicate leaks a half-uploaded photograph into a timeline whose
 * entire job is to hide things reliably.
 *
 * `item_id` is `SET NULL`: the transfer record outlives the photograph,
 * because the original filename and the transfer outcome live nowhere else.
 *
 * `original_captured_at` is frozen when the capture-date ladder first runs and
 * is never written again, and ingest copies **this** column into
 * `items.original_captured_at` rather than the possibly amended `captured_at`.
 * Without it, an uploader correcting a date before commit would have their
 * correction frozen as though the file had said it, and "revert to what the
 * file said" would revert to what a person typed.
 */
export type UploadFilesTable = {
  id: string;
  upload_session_id: string;
  item_id: string | null;
  position: number;
  original_filename: string;
  declared_content_type: string;
  declared_bytes: number;
  content_hash: string | null;
  kind: string | null;
  storage_key: string | null;
  state: string;
  attempt_count: number;
  presigned_until: string | null;
  multipart_upload_id: string | null;
  problem_code: string | null;
  problem_detail: string | null;
  captured_at: string | null;
  capture_date: string | null;
  capture_offset_minutes: number | null;
  capture_source: string | null;
  original_captured_at: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * One bulk action from the "What you have added" list, persisted rather than
 * held in the browser.
 *
 * One row per bulk action rather than one per file per action, so a
 * server-authoritative fan-out at ingest replaces a 264 x 3 payload replayed
 * from a browser that may have been reloaded, and twenty minutes of tagging
 * survives a reload on a phone.
 *
 * **A new tag or person gets its row at ingest, not when Enter is pressed**:
 * `label_snapshot` carries the typed name meanwhile, so an abandoned batch
 * cannot pollute the vocabulary the whole product filters by. Ingest writes
 * the resolved id back here along with `applied_at`, which is what stops the
 * other 263 files each creating another Mateo. A new **milestone** is the
 * opposite and gets its row immediately, because the surface promises it
 * appears in the timeline straight away, so `label_snapshot` is never
 * accepted for one.
 *
 * `undone_at` is set by Undo and the row stays, so the record of what was
 * undone survives; ingest skips any edit carrying it.
 */
export type UploadBatchEditsTable = {
  id: string;
  upload_session_id: string;
  kind: string;
  tag_id: string | null;
  person_id: string | null;
  milestone_id: string | null;
  label_snapshot: string | null;
  created_by: string;
  created_at: string;
  undone_at: string | null;
  applied_at: string | null;
};

/** One file a bulk action applies to. Ingest drives from the file. */
export type UploadBatchEditTargetsTable = {
  id: string;
  upload_batch_edit_id: string;
  upload_file_id: string;
};

/**
 * One storage object whose row is already gone and whose bytes are not.
 *
 * There is no transaction spanning SQLite and Backblaze. A delete must commit
 * the rows first, so the photograph genuinely vanishes, and then delete the
 * objects, which can fail. Without this table a B2 failure leaves a family
 * paying to store a photograph they were told was destroyed, with no record
 * that it is still there.
 *
 * **No foreign key to `items`, deliberately**: these rows outlive the item by
 * design, and are enqueued in the same transaction as the row delete.
 */
export type PendingObjectDeletionsTable = {
  id: string;
  storage_key: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  last_attempted_at: string | null;
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
  comments: CommentsTable;
  item_reactions: ItemReactionsTable;
  comment_reactions: CommentReactionsTable;
  removal_requests: RemovalRequestsTable;
  upload_sessions: UploadSessionsTable;
  upload_files: UploadFilesTable;
  upload_batch_edits: UploadBatchEditsTable;
  upload_batch_edit_targets: UploadBatchEditTargetsTable;
  pending_object_deletions: PendingObjectDeletionsTable;
};
