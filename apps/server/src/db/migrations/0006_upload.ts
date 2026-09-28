import { sql, type Kysely } from "kysely";

/**
 * Upload: the batch, its files, the edit plan that survives a reload, and the
 * objects whose rows are already gone.
 *
 * Five tables, and this migration closes a loop. Migration 0003 declared
 * `items.upload_session_id` and `bursts.upload_session_id` as foreign keys to
 * `upload_sessions`, a table that did not exist yet: SQLite resolves a foreign
 * key's target when a row is written rather than when the table is declared,
 * so those two references have been dangling harmlessly ever since. Creating
 * `upload_sessions` here is what makes them resolve, and after this migration
 * every foreign key in the schema points at a table that exists.
 *
 * Three things about the group are worth reading before changing anything.
 *
 * **`upload_files` is not `items`, deliberately.** A refused PDF and a file
 * that never arrived are never photographs, and an `items.state = 'pending'`
 * would put `AND state = 'ready'` into every read query in the product, where
 * one missed predicate leaks a half-uploaded photograph into a timeline whose
 * entire job is to hide things reliably (`data-models.md` § `upload_files`).
 *
 * **Two of the three uniques on `upload_files` are partial, and that is not
 * decoration.** SQLite counts distinct nulls as distinct inside a unique
 * index, so a unique touching a nullable column rejects less than it looks
 * like it does. The partial predicates are what keep those two indexes honest
 * about which rows they cover; see each one below.
 *
 * **No stored progress counts.** `done_count`, `failed_count` and
 * `bytes_transferred` are all a `GROUP BY state` over at most a few hundred
 * rows on `(upload_session_id, state)`, and denormalising them invites drift
 * on the surface where a wrong count is most visible. `file_count` and
 * `total_bytes` are a different thing and are columns: they are the figures
 * the batch committed to, frozen at commit.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // The batch. First-class because the notification is keyed to it, because
  // it is the resume unit, and because the done state reports on it as an
  // object.
  await database.schema
    .createTable("upload_sessions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // RESTRICT, the same choice as `items.uploaded_by`, and it never fires:
    // members are not hard-deleted, removal is a `status` change. Resume is
    // scoped by this column and so is the one-open-session conflict check.
    .addColumn("uploaded_by", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    // `settled` and `cancelled` are terminal; everything else is resumable,
    // which is the whole of "a reloaded upload resumes" (Decision 15).
    .addColumn("state", "text", (column) => {
      return column
        .notNull()
        .check(sql`state IN ('draft', 'uploading', 'settled', 'cancelled')`);
    })
    // One rule for the whole batch, and a single column rather than a
    // per-session subject table: the hoisted-rules decision paying for itself.
    // RESTRICT for the same reason as `items.visibility_rule_id`, since a
    // batch with no rule has undefined visibility, which fails open. Ingest
    // **copies** this id onto each item; items never reference the session's
    // rule, or editing one photograph's visibility a month later would
    // silently change the other 263.
    .addColumn("visibility_rule_id", "text", (column) => {
      return column
        .notNull()
        .references("visibility_rules.id")
        .onDelete("restrict");
    })
    // Both are 0 on a draft with no manifest yet and are frozen at commit:
    // `file_count` is the manifest's row count and `total_bytes` the sum of
    // declared bytes over the rows that are not `refused`. They are the
    // figures the batch committed to, which is why extra files re-selected on
    // resume that match nothing belong to a new session rather than this one.
    .addColumn("file_count", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    .addColumn("total_bytes", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    // **Diagnostic only. Nothing resolves against it, and nothing may.** An
    // offset-less capture date resolves in `shoebox.timezone`, because the day
    // a photograph lands on must not depend on where the uploader was
    // standing: the same file uploaded by two people would otherwise land on
    // two different days. The column is worth keeping as a record of what the
    // browser claimed, which helps when a date later turns out wrong
    // (Decision 10, which overrules an earlier draft of § Capture dates).
    .addColumn("client_timezone", "text", (column) => {
      return column.notNull();
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    // Null until "Put 264 up". **No byte may move before it is set**: presign
    // refuses while it is null, which is the whole point of the column.
    .addColumn("committed_at", "text")
    // Equal to `created_at` at insert. Bumped by presign and by every file
    // transition, and what the abandoned-batch sweeper reads.
    .addColumn("last_activity_at", "text", (column) => {
      return column.notNull();
    })
    // **The settle latch, and it latches on this rather than on
    // `notified_at`.** Mail is the spec's named single point of failure, so a
    // batch must be able to finish while mail is down, leaving a retryable
    // outbox row. `UPDATE ... WHERE settled_at IS NULL AND NOT EXISTS (a
    // non-terminal file)` fires for exactly one caller, and that caller
    // enqueues the one email.
    .addColumn("settled_at", "text")
    // Written by the mail fan-out, null until then.
    .addColumn("notified_at", "text")
    // A record of what was sent, not a live figure: how many people the email
    // went to at the time. It is not a count the reader's visibility filters,
    // which is why storing it does not breach the counting rule, and it must
    // never be rendered as though it were one.
    .addColumn("notified_member_count", "integer")
    .execute();

  // `GET /api/upload-sessions/current` and the one-open-session conflict check
  // on `POST /api/upload-sessions`. Both read "this member's non-terminal
  // session", which is the leading-column shape.
  await database.schema
    .createIndex("upload_sessions__by_uploader_state")
    .on("upload_sessions")
    .columns(["uploaded_by", "state"])
    .execute();

  // The per-file state machine, and the manifest row that makes a batch
  // resumable.
  await database.schema
    .createTable("upload_files")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // CASCADE: a file has no meaning outside its batch.
    .addColumn("upload_session_id", "text", (column) => {
      return column
        .notNull()
        .references("upload_sessions.id")
        .onDelete("cascade");
    })
    // **SET NULL**, because the transfer record outlives the photograph: the
    // original filename and the transfer outcome live nowhere else, so a
    // CASCADE would erase the only record that a file ever arrived
    // (`data-models.md` § Deleting an item: the cascade matrix).
    .addColumn("item_id", "text", (column) => {
      return column.references("items.id").onDelete("set null");
    })
    // The next free ordinal within the session. Also the page cursor for
    // `GET /api/upload-sessions/:sessionId`, which is why it is unique per
    // session rather than merely indexed.
    .addColumn("position", "integer", (column) => {
      return column.notNull();
    })
    .addColumn("original_filename", "text", (column) => {
      return column.notNull();
    })
    // What the browser said, not what the server verified. A type outside
    // `upload.accepted_content_types` is refused here, before any byte moves.
    .addColumn("declared_content_type", "text", (column) => {
      return column.notNull();
    })
    .addColumn("declared_bytes", "integer", (column) => {
      return column.notNull();
    })
    // Null until presign writes it. It is what a resumed selection matches
    // against, so anything that did land is skipped rather than re-sent.
    .addColumn("content_hash", "text")
    // Null while unknown, and it stays null for a refused file: a rejected PDF
    // is neither a photograph nor a video, and inventing a kind for it would
    // be a fact the server does not have. A `CHECK` in SQLite fails only when
    // it evaluates to false, so a null passes this one by construction.
    .addColumn("kind", "text", (column) => {
      return column.check(sql`kind IN ('photo', 'video')`);
    })
    // The object's key, never a URL: a URL is a short-lived signed thing
    // minted at render. Null until presign chooses one.
    .addColumn("storage_key", "text")
    // `done`, `failed`, `refused` and `cancelled` are terminal, which is what
    // lets a partial batch settle and send: the latch waits only on `waiting`
    // and `sending`.
    .addColumn("state", "text", (column) => {
      return column.notNull().check(
        sql`state IN (
          'waiting', 'sending', 'done', 'failed', 'refused', 'cancelled'
        )`,
      );
    })
    // Incremented by presign, so "Try the one that dropped" is visible.
    .addColumn("attempt_count", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    // Advisory: Backblaze answers 403 on an expired URL and the client
    // re-presigns. It is also how a stale `sending` row is recognised.
    .addColumn("presigned_until", "text")
    // Backblaze's own id, for a file over `upload.multipart_threshold_bytes`.
    .addColumn("multipart_upload_id", "text")
    // Why a file is not up. Enum values in a payload, never HTTP error codes.
    .addColumn("problem_code", "text", (column) => {
      return column.check(
        sql`problem_code IN (
          'unsupported_type', 'too_large', 'empty_file', 'connection_lost',
          'checksum_mismatch', 'content_mismatch', 'storage_rejected',
          'abandoned', 'cancelled_by_uploader'
        )`,
      );
    })
    // English, for the admin's eye. Never the primary interface copy.
    .addColumn("problem_detail", "text")
    // What the capture-date ladder decided, and what an uploader may amend on
    // the `milestone-fix` state before commit. Amending preserves the clock
    // time and changes only the date, so no fact is invented.
    .addColumn("captured_at", "text")
    // Local `YYYY-MM-DD`, the counterpart of `items.captured_on`. Named
    // `capture_date` here because `data-models.md` names it that; the two
    // columns hold the same kind of value under two spellings.
    .addColumn("capture_date", "text")
    // Null means the evidence carried no offset at all, so the instant above
    // was resolved in `shoebox.timezone` and is a considered guess rather than
    // a fact the file stated. Only rungs 1 and 2 of the ladder ever set it.
    .addColumn("capture_offset_minutes", "integer")
    // Which rung of the ladder decided the date. The same six values as
    // `items.capture_source`, and for the same reason: which day a photograph
    // lands on is user-visible, so the derivation has to be recoverable.
    .addColumn("capture_source", "text", (column) => {
      return column.check(
        sql`capture_source IN (
          'exif', 'video_metadata', 'filename',
          'file_mtime', 'uploader_set', 'upload_time'
        )`,
      );
    })
    // **Frozen when the ladder first runs and never written again**, exactly
    // as its namesake on `items` is, and ingest copies **this** column into
    // `items.original_captured_at` rather than the possibly amended
    // `captured_at` above. Without it an uploader's pre-commit date fix is
    // frozen as though the file had said it, and Decision 10's "revert to what
    // the file said" quietly reverts to what a person typed. Nullable because
    // the ladder has not run on a row that has only just been manifested.
    .addColumn("original_captured_at", "text")
    // Intrinsic facts read from the file at completion, null until then.
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_ms", "integer")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("updated_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // The manifest's own order, and the page cursor. Both columns are NOT NULL,
  // so this one is a plain unique and genuinely rejects a duplicate ordinal.
  await database.schema
    .createIndex("upload_files__session_position")
    .unique()
    .on("upload_files")
    .columns(["upload_session_id", "position"])
    .execute();

  // One object, one file, across the whole deployment.
  //
  // **Must be partial.** `storage_key` is null on every row until presign
  // chooses one, and SQLite counts distinct nulls as distinct inside a unique
  // index, so a plain unique would not actually reject anything among those
  // rows. That costs nothing here, since they are exactly the rows with no key
  // to collide over, but the `WHERE` is what makes the index say so rather
  // than leave a reader to work it out.
  await database.schema
    .createIndex("upload_files__storage_key")
    .unique()
    .on("upload_files")
    .column("storage_key")
    .where("storage_key", "is not", null)
    .execute();

  // Idempotent retry: the same bytes offered twice in one batch are one file.
  //
  // **Must be partial, for the same reason**, and this one matters more. A
  // freshly manifested batch is 264 rows with a null hash, and a plain unique
  // would let all 264 stand, which is correct, while reading as though it had
  // checked something. The predicate confines the index to the rows that carry
  // a hash, which are the rows the retry path probes.
  await database.schema
    .createIndex("upload_files__session_content_hash")
    .unique()
    .on("upload_files")
    .columns(["upload_session_id", "content_hash"])
    .where("content_hash", "is not", null)
    .execute();

  // The progress aggregate, the `states` filter, the settle latch's
  // `NOT EXISTS`, and the bulk cancel. All four are this shape.
  await database.schema
    .createIndex("upload_files__session_state")
    .on("upload_files")
    .columns(["upload_session_id", "state"])
    .execute();

  // Not in the model's index list, and here for the same reason
  // `bursts_cover_item` and `removal_requests__by_item` are: deleting an item
  // fires the SET NULL above against a table that grows with the archive, and
  // without this every item delete scans every file ever transferred. Partial
  // because a null `item_id` is exactly the case this index has nothing to
  // find.
  await database.schema
    .createIndex("upload_files__by_item")
    .on("upload_files")
    .column("item_id")
    .where("item_id", "is not", null)
    .execute();

  // One bulk action from the "What you have added" list, persisted rather than
  // held in the browser: one row per action rather than one per file per
  // action, and a server-authoritative fan-out at ingest rather than a
  // 264 x 3 payload replayed from a browser that may have been reloaded.
  await database.schema
    .createTable("upload_batch_edits")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // CASCADE: the plan belongs to the batch.
    .addColumn("upload_session_id", "text", (column) => {
      return column
        .notNull()
        .references("upload_sessions.id")
        .onDelete("cascade");
    })
    .addColumn("kind", "text", (column) => {
      return column
        .notNull()
        .check(sql`kind IN ('tag', 'person', 'milestone')`);
    })
    // RESTRICT on both, and neither can fire today: no route deletes a tag or
    // a person, and a tag that ends up on no items is a directory entry with a
    // count of zero rather than a row to remove. SET NULL was the alternative
    // and is wrong for a tag or a person chosen from the picker, which carries
    // no `label_snapshot`: nulling the id would leave an edit naming nothing
    // at all.
    .addColumn("tag_id", "text", (column) => {
      return column.references("tags.id").onDelete("restrict");
    })
    .addColumn("person_id", "text", (column) => {
      return column.references("people.id").onDelete("restrict");
    })
    // CASCADE, and it is the one of the three that can fire.
    // `DELETE /api/milestones/:milestoneId` promises that nothing blocks it,
    // which rules out RESTRICT, and a milestone edit carries no
    // `label_snapshot` to fall back on, which rules out SET NULL: the row
    // would name nothing, and the `CHECK` below would then abort the
    // milestone delete, which is the promise broken a second way. Dropping the
    // planned action along with the occasion it planned is the coherent
    // reading, and it removes nothing but the plan.
    .addColumn("milestone_id", "text", (column) => {
      return column.references("milestones.id").onDelete("cascade");
    })
    // The name as typed, for a tag or a person the archive has never heard of,
    // carried until ingest creates the row. Never accepted for a milestone,
    // whose row exists from the moment it is created.
    .addColumn("label_snapshot", "text")
    // NOT NULL and RESTRICT, the same choice as `items.uploaded_by` rather
    // than the SET NULL that `item_tags.tagged_by` uses: this is a transient
    // plan owned by one session, not an archive row whose author is incidental
    // attribution, and it cannot exist without the member who made it. It
    // never fires, because members are not hard-deleted.
    .addColumn("created_by", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    // Set by Undo, and the row stays, so the record of what was undone
    // survives. Ingest skips any edit carrying it.
    .addColumn("undone_at", "text")
    // Written at ingest, together with the resolved `tag_id` or `person_id`.
    .addColumn("applied_at", "text")
    // Every kind has to name something ingest can apply.
    //
    // **"At least one" for a tag and a person, not an exclusive or**, and the
    // difference is load-bearing: a new tag starts with only a
    // `label_snapshot`, and ingest writes the resolved `tag_id` back onto the
    // same row, so both columns are set afterwards. An XOR here would fail
    // that write-back on every batch carrying a new tag. A milestone is the
    // strict case, because its row exists before the edit does and a
    // `label_snapshot` is never accepted for one.
    .addCheckConstraint(
      "upload_batch_edits_names_something",
      sql`(kind = 'tag'
            AND (tag_id IS NOT NULL OR label_snapshot IS NOT NULL))
          OR (kind = 'person'
            AND (person_id IS NOT NULL OR label_snapshot IS NOT NULL))
          OR (kind = 'milestone'
            AND milestone_id IS NOT NULL AND label_snapshot IS NULL)`,
    )
    .execute();

  // The surface's own list, newest last, excluding undone rows. Also what
  // `POST /commit` freezes and what ingest reads once per session.
  await database.schema
    .createIndex("upload_batch_edits__by_session")
    .on("upload_batch_edits")
    .columns(["upload_session_id", "created_at"])
    .execute();

  // One file a bulk action applies to.
  await database.schema
    .createTable("upload_batch_edit_targets")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("upload_batch_edit_id", "text", (column) => {
      return column
        .notNull()
        .references("upload_batch_edits.id")
        .onDelete("cascade");
    })
    .addColumn("upload_file_id", "text", (column) => {
      return column.notNull().references("upload_files.id").onDelete("cascade");
    })
    .execute();

  // Dedupes a double-submitted selection, and carries the "on 12 of 264"
  // count. Both columns are NOT NULL, so this one rejects what it appears to.
  await database.schema
    .createIndex("upload_batch_edit_targets__edit_file")
    .unique()
    .on("upload_batch_edit_targets")
    .columns(["upload_batch_edit_id", "upload_file_id"])
    .execute();

  // Indexed on the file because **ingest runs the other way round**: it asks
  // "which edits target this file", once per file, and the unique above leads
  // on the edit.
  await database.schema
    .createIndex("upload_batch_edit_targets__by_file")
    .on("upload_batch_edit_targets")
    .column("upload_file_id")
    .execute();

  // One storage object whose row is already gone and whose bytes are not.
  //
  // **No foreign key to `items`, deliberately.** These rows outlive the item
  // by design: there is no transaction spanning SQLite and Backblaze, so a
  // delete commits the rows first, so the photograph genuinely vanishes, and
  // then deletes the objects, which can fail. A foreign key would make the
  // table impossible, since the row it would reference is always already gone
  // by the time this one is read. Every rendition's key is enqueued here
  // inside the same transaction as the row delete, and a drainer works
  // through them. Without it a Backblaze failure leaves a family paying to
  // store a photograph they were told was destroyed, with no record that it
  // is still there.
  await database.schema
    .createTable("pending_object_deletions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // Not a foreign key to `item_renditions.storage_key` either, and for the
    // same reason: that row went with the item.
    .addColumn("storage_key", "text", (column) => {
      return column.notNull();
    })
    .addColumn("attempts", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    // The last failure from Backblaze, for the admin's eye.
    .addColumn("last_error", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    // Null until the first attempt, and the drainer's backoff reads it.
    .addColumn("last_attempted_at", "text")
    .execute();

  // Enqueueing the same key twice is one object to delete, not two attempts.
  // `storage_key` is NOT NULL, so a plain unique is enough here: there is no
  // null for SQLite to count as distinct.
  await database.schema
    .createIndex("pending_object_deletions__storage_key")
    .unique()
    .on("pending_object_deletions")
    .column("storage_key")
    .execute();
}

/**
 * Drops the five tables, children before parents.
 *
 * `pending_object_deletions` is free-standing. Then the two edit tables, then
 * the files, then the sessions, which `items` and `bursts` still reference:
 * dropping `upload_sessions` puts those two back to the dangling forward
 * references they held between migrations 0003 and 0006, which SQLite accepts
 * and which is exactly the state this migration found.
 */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("pending_object_deletions").execute();
  await database.schema.dropTable("upload_batch_edit_targets").execute();
  await database.schema.dropTable("upload_batch_edits").execute();
  await database.schema.dropTable("upload_files").execute();
  await database.schema.dropTable("upload_sessions").execute();
}
