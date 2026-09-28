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
