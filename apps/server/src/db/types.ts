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
 * One setting, scoped to the whole instance or to one member.
 *
 * **A fresh instance holds zero rows and still renders correctly**: every key
 * resolves from `SETTING_DEFINITIONS` in `packages/shared`, which owns each
 * key's Zod schema, its default and the scopes it permits. A row here is an
 * override somebody wrote, never a seed.
 *
 * `scope_id` is polymorphic and so carries no foreign key: it is null for an
 * instance row and a member id for a member row, which a `CHECK` enforces.
 */
export type SettingsTable = {
  id: string;
  scope: string;
  scope_id: string | null;
  key: string;
  value: string;
  updated_at: string;
  updated_by_member_id: string | null;
};

/**
 * One message, in a table that is both the queue and the permanent log.
 *
 * `to_address` is denormalised because an invitation has no member yet and the
 * address a message went to must survive a later change. `payload_json` holds
 * **resolved values, not ids**, so a retry a day later renders the same
 * message even if the comment was edited or the item deleted.
 *
 * `idempotency_key` is the only thing standing between a retried handler and
 * two hundred duplicate emails, which is why it is `NOT NULL` as well as
 * unique: every kind has a recipe for it.
 *
 * `trigger_id` carries **no foreign key**, deliberately: the trigger can be
 * deleted and the mail record must outlive it.
 *
 * A `sign_in_code` row is scrubbed once terminal, and `subject` is scrubbed
 * with it, because the six digits are deliberately in the subject line so the
 * code reads off a lock screen. Both columns are rewritten rather than nulled
 * (`payload_json` to `{}`, `subject` to "Your code"), so both stay `NOT NULL`.
 */
export type OutboundEmailsTable = {
  id: string;
  kind: string;
  to_address: string;
  to_member_id: string | null;
  from_address: string | null;
  subject: string;
  payload_json: string;
  trigger_kind: string;
  trigger_id: string;
  idempotency_key: string;
  state: string;
  send_after: string;
  attempts: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  provider_request_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  delivery_state: string | null;
  delivery_updated_at: string | null;
  created_at: string;
  sent_at: string | null;
};

/**
 * One provider webhook about one message: delivered, bounced, complained.
 *
 * `UNIQUE (email_id, event, occurred_at)` is what makes a replayed webhook
 * harmless, and all three columns are `NOT NULL` so that it rejects what it
 * appears to: SQLite counts distinct nulls as distinct inside a unique index.
 */
export type EmailDeliveryEventsTable = {
  id: string;
  email_id: string;
  event: string;
  occurred_at: string;
  received_at: string;
  detail_json: string | null;
};

/**
 * One address the provider has told us to stop writing to.
 *
 * **A suppressed address still gets sign-in codes.** A spam complaint must
 * never lock a family member out of their own archive, and the repeated
 * failure is itself the diagnostic. Every other kind addressed to a suppressed
 * address is written and then set `state = 'suppressed'` without a send.
 *
 * `cleared_at` lifts the suppression in place rather than deleting the row, so
 * the record that it once happened survives.
 */
export type EmailSuppressionsTable = {
  id: string;
  address: string;
  reason: string;
  created_at: string;
  cleared_at: string | null;
};

/**
 * One (member, item) pair: whether a print has been in front of somebody, and
 * whether they ever opened it.
 *
 * **Bounded by content rather than by behaviour.** One row per pair forever,
 * so scrolling a 212-item day writes 212 rows the first time and exactly zero
 * every time after, and the table cannot run away however much the archive is
 * used. Neither retention nor rollup is needed.
 *
 * `first_seen_at` and `first_opened_at` are different facts and both get
 * written: opening at full size latches both, a burst's sibling strip latches
 * only the first. There is deliberately **no `last_seen_at`**, because
 * maintaining one is a write on every impression, which is the whole cost the
 * collapse avoids.
 */
export type ItemViewsTable = {
  id: string;
  member_id: string;
  item_id: string;
  first_seen_at: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
};

/**
 * One audit row: wide, sparse, append-only.
 *
 * It records only what the state tables cannot answer later, which is
 * deletions and any change to who may see what or who may do what.
 *
 * **`subject_id` has no foreign key, and that is the central design point.**
 * An audit log outlives its subjects, so an `item_deleted` row must hold a
 * dangling id. Referential integrity here would either forbid the row or
 * cascade it away exactly when it becomes valuable.
 *
 * `actor_label`, `subject_label` and `device_label` are all denormalised so
 * the log reads correctly with no join after the rows it describes are gone.
 * The third is the one that looks optional and is not: `device_id` is
 * `SET NULL` to `sessions`, which fall out at 30 days idle, so without it most
 * of the log would read "device no longer known".
 *
 * **No retention rule**, deliberately: the first question anybody asks of an
 * audit log is about something old.
 */
export type ActivityEventsTable = {
  id: string;
  kind: string;
  occurred_at: string;
  actor_member_id: string | null;
  actor_label: string;
  subject_kind: string;
  subject_id: string | null;
  subject_label: string;
  device_id: string | null;
  device_label: string | null;
  detail_json: string | null;
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
  settings: SettingsTable;
  outbound_emails: OutboundEmailsTable;
  email_delivery_events: EmailDeliveryEventsTable;
  email_suppressions: EmailSuppressionsTable;
  item_views: ItemViewsTable;
  activity_events: ActivityEventsTable;
};
