import { sql, type Kysely } from "kysely";

/**
 * The archive: the photographs themselves, their stored objects, and
 * everything the product hangs off one of them.
 *
 * Ten tables, and the largest migration in the schema. Three things about it
 * are worth reading before changing anything here.
 *
 * **`items` and `bursts` reference each other.** `items.burst_id` points at
 * `bursts` and `bursts.cover_item_id` points back at `items`, both SET NULL.
 * SQLite resolves a foreign key's target when a row is written rather than
 * when the table is declared, so the cycle costs nothing as long as both
 * tables exist before the first insert. `items` is created first and the
 * forward reference is left standing; do not try to break the cycle with a
 * later `ALTER TABLE`, which SQLite cannot do to a foreign key anyway.
 *
 * **`items.upload_session_id` and `bursts.upload_session_id` point at
 * `upload_sessions`, which migration 0006 creates.** Same lazy resolution, and
 * expected: every migration is applied before anything inserts a row.
 *
 * **No stored count that visibility can filter.** A day's total, a tag's
 * total, a person's total, a milestone's total and a burst's frame count are
 * all per viewer, because a hidden item "does not appear, and it is not
 * counted". None of them is a column here and none may become one
 * (`data-models.md` § One rule that outranks the others). This is the single
 * most likely place a hidden photograph leaks, and the change that causes it
 * will look like an obvious denormalisation in a diff.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // Created first so that `bursts.cover_item_id` below has a target. Its own
  // `burst_id` points forward at a table that does not exist yet, which is
  // fine: see the note at the head of this file.
  //
  // **No `deleted_at`.** The spec forbids a hidden flag in three separate
  // places, so do not let a soft delete in.
  await database.schema
    .createTable("items")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("kind", "text", (column) => {
      return column.notNull().check(sql`kind IN ('photo', 'video')`);
    })
    .addColumn("captured_at", "text", (column) => {
      return column.notNull();
    })
    // Null means the file carried no offset at all, so `captured_on` below was
    // resolved in the Shoebox timezone and is a considered guess rather than a
    // fact the file stated (Decision 10).
    .addColumn("captured_at_offset_minutes", "integer")
    // **Local** `YYYY-MM-DD`, derived at write. The timeline's grouping key,
    // and stored rather than computed because `date(captured_at)` in UTC puts
    // a 23:30 local photograph on the wrong day and therefore under the wrong
    // milestone.
    .addColumn("captured_on", "text", (column) => {
      return column.notNull();
    })
    // How the capture date was arrived at. Which day a photograph lands on is
    // user-visible, so the derivation has to be recoverable.
    //
    // **There is no `'manual'` member here, deliberately.** A hand correction
    // from the item viewer lands as `'uploader_set'`, and the fact that it was
    // a hand correction is recorded in `item_capture_date_changes.reason`,
    // whose enum does have `'manual'`. This column records **how** a date was
    // arrived at; that one records **why** it was changed. Two API slices read
    // the pair as interchangeable before it was settled, and they are not
    // (`data-models.md` Decision 10).
    .addColumn("capture_source", "text", (column) => {
      return column.notNull().check(
        sql`capture_source IN (
          'exif', 'video_metadata', 'filename',
          'file_mtime', 'uploader_set', 'upload_time'
        )`,
      );
    })
    // Frozen at ingest, never written again by either date-correction path.
    // Gives "revert to what the file said" without a lookup, however many
    // times the date has been moved since.
    .addColumn("original_captured_at", "text", (column) => {
      return column.notNull();
    })
    // Monotonic arrival order, assigned in the insert transaction. **Not
    // `rowid`**: `VACUUM` can renumber rowids on a table whose primary key is
    // not `INTEGER`, and the unseen comparison would then be wrong for every
    // member at once.
    .addColumn("seq", "integer", (column) => {
      return column.notNull();
    })
    // RESTRICT, and it never fires: members are not hard-deleted, removal is a
    // `status` change. Deletion rights and notification routing both read it.
    .addColumn("uploaded_by", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    // Burst detection scope. SET NULL because purging an old session must not
    // endanger the photographs it brought in. `upload_sessions` arrives in
    // migration 0006.
    .addColumn("upload_session_id", "text", (column) => {
      return column.references("upload_sessions.id").onDelete("set null");
    })
    // RESTRICT: an item with no rule has undefined visibility, which fails
    // open. The rule is **copied** from the upload session onto the item
    // rather than referenced through it, so editing one photograph's
    // visibility a month later cannot silently change the other 263.
    .addColumn("visibility_rule_id", "text", (column) => {
      return column
        .notNull()
        .references("visibility_rules.id")
        .onDelete("restrict");
    })
    // SET NULL: dissolving a burst leaves forty-five prints standing.
    .addColumn("burst_id", "text", (column) => {
      return column.references("bursts.id").onDelete("set null");
    })
    // 1-based. Orders the sibling strip without a second sort key.
    .addColumn("burst_index", "integer")
    // **Display** dimensions, after EXIF orientation has been applied. That is
    // a note for whoever writes ingest rather than something the database can
    // enforce, and it is the most likely silent layout bug in the product:
    // storing the raw EXIF pair for a portrait phone photograph carrying an
    // orientation flag gives the pile a landscape box with a rotated image
    // inside it. The pile crops nothing, so the proportions are load-bearing.
    .addColumn("width", "integer", (column) => {
      return column.notNull();
    })
    .addColumn("height", "integer", (column) => {
      return column.notNull();
    })
    // Videos only, and it must be stored: the transport positions a pinned
    // comment's mark as `at_seconds / duration`, so without it every mark
    // lands wrong on first paint and then jumps.
    .addColumn("duration_ms", "integer")
    .addColumn("byte_size", "integer", (column) => {
      return column.notNull();
    })
    .addColumn("content_type", "text", (column) => {
      return column.notNull();
    })
    // Within-upload dedupe only.
    .addColumn("checksum", "text")
    .addColumn("original_filename", "text")
    // An **override**, written only when somebody types a real description.
    // Null is the normal case: the served alt text is composed at render from
    // the people tags and the capture date (Decision 9).
    .addColumn("alt_text", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // Ordering, and the unseen comparison that reads it.
  await database.schema
    .createIndex("items_seq")
    .unique()
    .on("items")
    .column("seq")
    .execute();

  // The timeline, and it is covering: the group-by runs in index order, the
  // visibility filter is checked inside the index, and a `LIMIT 30` stops
  // early without touching the table.
  await database.schema
    .createIndex("items_captured_on_rule_id")
    .on("items")
    .columns(["captured_on desc", "visibility_rule_id", "id"])
    .execute();

  // The mirror of the one above, which wins when the visible rule set is very
  // selective. Keep both, run `ANALYZE`, and let the planner choose.
  await database.schema
    .createIndex("items_rule_captured_on")
    .on("items")
    .columns(["visibility_rule_id", "captured_on"])
    .execute();

  // Fanning a burst open, in frame order. Also what keeps dissolving a burst
  // from scanning the whole table to apply the SET NULL.
  await database.schema
    .createIndex("items_burst_index")
    .on("items")
    .columns(["burst_id", "burst_index"])
    .execute();

  // Burst detection at settle, and the upload day grouping.
  await database.schema
    .createIndex("items_session_captured")
    .on("items")
    .columns(["upload_session_id", "captured_on", "captured_at"])
    .execute();

  // "My uploads".
  await database.schema
    .createIndex("items_uploaded_by")
    .on("items")
    .column("uploaded_by")
    .execute();

  // A video has five or six stored objects and a photograph has three, so they
  // are a child table rather than six widening nullable columns on `items`.
  //
  // **These are keys, not URLs.** A URL is a short-lived signed thing minted
  // at render. The pile fetches these one batched query per page, keyed by the
  // page's item ids, never one join per print.
  //
  // CASCADE on `item_id` is the only cascade in the schema with a side effect
  // outside the database: every row's `storage_key` has to be enqueued into
  // `pending_object_deletions` in the same transaction, because nothing else
  // will ever name those objects again.
  await database.schema
    .createTable("item_renditions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    .addColumn("purpose", "text", (column) => {
      return column.notNull().check(
        sql`purpose IN (
          'original', 'display', 'thumb',
          'poster', 'video_webm', 'video_mp4'
        )`,
      );
    })
    .addColumn("storage_key", "text", (column) => {
      return column.notNull();
    })
    .addColumn("content_type", "text", (column) => {
      return column.notNull();
    })
    .addColumn("byte_size", "integer", (column) => {
      return column.notNull();
    })
    // Not null because the frozen `MediaSource` DTO carries a width and a
    // height for every purpose it serves, so a rendition with unknown
    // dimensions could not be drawn anyway
    // (`apis/conventions.md` § The frozen DTOs).
    .addColumn("width", "integer", (column) => {
      return column.notNull();
    })
    .addColumn("height", "integer", (column) => {
      return column.notNull();
    })
    .execute();

  // One row per purpose per item, and this is also the lookup the viewer and
  // the pile drive: `WHERE item_id IN (...)`.
  await database.schema
    .createIndex("item_renditions_item_purpose")
    .unique()
    .on("item_renditions")
    .columns(["item_id", "purpose"])
    .execute();

  // So a double upload cannot point two rows at one object and make deletion
  // ambiguous: the second row would keep alive an object the first row's item
  // no longer owns.
  await database.schema
    .createIndex("item_renditions_storage_key")
    .unique()
    .on("item_renditions")
    .column("storage_key")
    .execute();

  // One run of frames shot together, detected once at settle and scoped to the
  // upload session that brought them in.
  //
  // **No `frame_count`, and this is not an oversight.** The viewer prints
  // "Frame 7 of 45" and the stack prints "45 frames, 06:41 to 06:44".
  // Visibility is per item, so a burst can be partially visible, and a stored
  // count is the unfiltered count: it would leak restricted frames through a
  // denominator in exactly the way the spec forbids for a day total. Both the
  // count and the span come from the visibility-filtered sibling query.
  //
  // **Deleting the last frame of a burst must drop the burst row**, and no
  // foreign key direction does that. It is a step in the delete transaction,
  // and in the hand-correction transaction too, since moving an item off its
  // burst's day ejects it from the burst.
  await database.schema
    .createTable("bursts")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // RESTRICT rather than the SET NULL `items` uses, because a burst is
    // meaningless without the session it was detected within: the detector's
    // scope is the session. A session purge therefore has to drop its bursts
    // first, which is the right order, since dissolving one leaves every
    // photograph standing.
    .addColumn("upload_session_id", "text", (column) => {
      return column
        .notNull()
        .references("upload_sessions.id")
        .onDelete("restrict");
    })
    .addColumn("captured_on", "text", (column) => {
      return column.notNull();
    })
    .addColumn("starts_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("ends_at", "text", (column) => {
      return column.notNull();
    })
    // The detector is configuration rather than a constant:
    // `burst.maxGapSeconds` and `burst.minimumFrameCount` live in
    // `app.config.ts` and an operator may change either. Recording the
    // parameters that produced a burst lets a new value, or a better
    // algorithm, re-derive the automatic groupings without touching anybody's
    // manual one.
    //
    // Both are null for a manual burst, which no detector produced and which a
    // re-derivation must therefore leave alone.
    .addColumn("detector_version", "integer")
    .addColumn("threshold_seconds", "integer")
    .addColumn("detected_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("is_manual", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(0)
        .check(sql`is_manual IN (0, 1)`);
    })
    // SET NULL, and set at all only when a person picked a cover. The cover
    // still resolves at read time: `cover_item_id` if the viewer can see it,
    // otherwise the earliest visible frame.
    .addColumn("cover_item_id", "text", (column) => {
      return column.references("items.id").onDelete("set null");
    })
    .execute();

  // Not in the model's index list, and here because deleting an item fires
  // this SET NULL against a table that grows with the archive. Without it
  // every item delete scans every burst.
  await database.schema
    .createIndex("bursts_cover_item")
    .on("bursts")
    .column("cover_item_id")
    .execute();

  // A named occasion spanning one or more days.
  //
  // **A milestone has no visibility of its own**, and there is deliberately no
  // `visibility_rule_id` here. The occasion and its name are visible to
  // everybody; only its photographs are restricted. The rejected alternative,
  // hiding a milestone whose visible item count is zero, has a bad property:
  // attaching one restricted photograph to a previously empty occasion would
  // make that occasion vanish from everybody else's timeline (Decision 5).
  await database.schema
    .createTable("milestones")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("name", "text", (column) => {
      return column.notNull();
    })
    .addColumn("starts_on", "text", (column) => {
      return column.notNull();
    })
    // Inclusive, and **equal to `starts_on` for a one-day occasion**, never
    // null. That single shape is the span model: `isMultiDayMilestone` is
    // literally `startsOn !== endsOn`, and a nullable `ends_on` would force
    // every helper and every caller to branch.
    .addColumn("ends_on", "text", (column) => {
      return column.notNull();
    })
    // The line under the name in the band.
    .addColumn("blurb", "text")
    // SET NULL: a milestone is a family fact that outlives whoever typed it.
    .addColumn("created_by", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("updated_at", "text", (column) => {
      return column.notNull();
    })
    // Enforced here rather than in a handler because the day-count helper
    // returns a negative otherwise and the day-list helper then builds an
    // array of negative length.
    .addCheckConstraint("milestones_span_ordered", sql`ends_on >= starts_on`)
    // SQLite has no date type, and an ISO datetime sneaking into either column
    // would break the string comparison that the check above and every overlap
    // query depend on.
    .addCheckConstraint(
      "milestones_dates_are_calendar_dates",
      sql`starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    )
    .execute();

  // The overlap predicate, which the day stream runs for every page. No unique
  // on `name`: two "Mateo's birthday" milestones a year apart are both
  // correct.
  await database.schema
    .createIndex("milestones_span")
    .on("milestones")
    .columns(["starts_on", "ends_on"])
    .execute();

  // One photograph attached to one occasion. Many-to-many deliberately: a
  // photograph from 17 September belongs to both "Home from the hospital" and
  // "Mateo's first week at home".
  //
  // **The CASCADE on `milestone_id` is the delete dialog's promise**: "The
  // occasion goes from the timeline. The 212 photographs stay exactly where
  // they are. Nothing is deleted except the label." It removes join rows only.
  // A cascade in the other direction, from the milestone to the items, would
  // be the most damaging bug the product could ship.
  //
  // An item may be attached to a milestone whose span does not contain it.
  // That is allowed, and it forces two things apart that look like one: a
  // milestone's **item set** is this table and never a date range, and a
  // milestone's **day set** is the date range and never this table.
  await database.schema
    .createTable("item_milestones")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    .addColumn("milestone_id", "text", (column) => {
      return column.notNull().references("milestones.id").onDelete("cascade");
    })
    .addColumn("attached_by", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    .addColumn("attached_at", "text", (column) => {
      return column.notNull();
    })
    // Set when somebody answers "Leave them as they are" to the span
    // reconciliation. Without it every visit re-offers the same fix for the
    // same four photographs and a considered decision becomes a nag. A later
    // hand correction that moves the item outside the span again clears it, so
    // the reconciliation is offered once more.
    .addColumn("span_mismatch_acknowledged_at", "text")
    .execute();

  await database.schema
    .createIndex("item_milestones_item_milestone")
    .unique()
    .on("item_milestones")
    .columns(["item_id", "milestone_id"])
    .execute();

  // The other direction: one occasion's items. Indexed both ways so a query
  // can drive from whichever predicate is the more selective.
  await database.schema
    .createIndex("item_milestones_milestone_item")
    .on("item_milestones")
    .columns(["milestone_id", "item_id"])
    .execute();

  // The audit trail for the one destructive metadata edit in the product.
  //
  // Worth a table because moving a capture date is the only edit that destroys
  // a fact the file carried, the server does not re-read EXIF out of B2, and
  // it is a bulk action, so "undo that" has to mean something. One row per
  // **moved item**, never one row per change: a single row saying 34 items
  // moved cannot be reverted per item.
  await database.schema
    .createTable("item_capture_date_changes")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    // The occasion whose span prompted the move, when one did. SET NULL: the
    // audit row outlives the milestone, and deleting an occasion deletes only
    // its label.
    .addColumn("milestone_id", "text", (column) => {
      return column.references("milestones.id").onDelete("set null");
    })
    .addColumn("previous_captured_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("previous_capture_date", "text", (column) => {
      return column.notNull();
    })
    // A snapshot of `items.capture_source` as it stood, so it carries that
    // column's enum and not this table's `reason` enum below.
    .addColumn("previous_capture_source", "text", (column) => {
      return column.notNull().check(
        sql`previous_capture_source IN (
          'exif', 'video_metadata', 'filename',
          'file_mtime', 'uploader_set', 'upload_time'
        )`,
      );
    })
    .addColumn("new_captured_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("new_capture_date", "text", (column) => {
      return column.notNull();
    })
    // RESTRICT, like every other authorship key: members are not hard-deleted.
    .addColumn("changed_by", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    .addColumn("changed_at", "text", (column) => {
      return column.notNull();
    })
    // Why the date was changed, which is **not** what `items.capture_source`
    // records. This enum has a `'manual'` member and that one does not: a hand
    // correction lands on the item as `capture_source = 'uploader_set'` and is
    // recorded here as `reason = 'manual'`.
    //
    // `'timezone_change'` is the Shoebox timezone being changed, which
    // rewrites `captured_on` for every item that carried no offset of its own
    // and writes one row per moved item rather than one row for the change.
    .addColumn("reason", "text", (column) => {
      return column
        .notNull()
        .check(
          sql`reason IN ('milestone_reconcile', 'manual', 'timezone_change')`,
        );
    })
    .execute();

  // Not in the model's index list. Two reasons: the item viewer reads one
  // item's history newest first to offer "revert that", and this is the only
  // child of `items` with no unique constraint to lend its cascade an index,
  // so without it every item delete scans the whole audit trail.
  await database.schema
    .createIndex("item_capture_date_changes_item_changed")
    .on("item_capture_date_changes")
    .columns(["item_id", "changed_at desc"])
    .execute();

  // Free text, so "Hospital" and "hospital" must not become two tags. `name`
  // keeps the display form as typed, spaces intact; `name_normalized` is
  // trimmed, lowercased, whitespace-collapsed and NFC, the same normalisation
  // `groups` uses.
  await database.schema
    .createTable("tags")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("name", "text", (column) => {
      return column.notNull();
    })
    .addColumn("name_normalized", "text", (column) => {
      return column.notNull().unique();
    })
    .addColumn("created_by", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // CASCADE on both sides: deleting an item drops its labels, and deleting a
  // tag unlabels the items. Contrast `item_people` below, where the person
  // side is RESTRICT.
  await database.schema
    .createTable("item_tags")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    .addColumn("tag_id", "text", (column) => {
      return column.notNull().references("tags.id").onDelete("cascade");
    })
    .addColumn("tagged_by", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    .addColumn("tagged_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  await database.schema
    .createIndex("item_tags_item_tag")
    .unique()
    .on("item_tags")
    .columns(["item_id", "tag_id"])
    .execute();

  // Indexed both ways so a multi-filter query can drive from whichever
  // predicate is the most selective. `item_tags` grows with the archive, so
  // this is not a nicety.
  await database.schema
    .createIndex("item_tags_tag_item")
    .on("item_tags")
    .columns(["tag_id", "item_id"])
    .execute();

  // Somebody who appears in photographs, whether or not they hold an account.
  //
  // **The link to an account goes here, not on `members`**, for three reasons:
  // the person record long predates the member record and may never get one;
  // linking later is a single `UPDATE people SET member_id = ?` that moves no
  // tagging history; and the unique index below is what stops two person
  // records claiming one account.
  await database.schema
    .createTable("people")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("display_name", "text", (column) => {
      return column.notNull();
    })
    // SET NULL: removing a member leaves the person, their tagging history and
    // their face in the directory untouched.
    .addColumn("member_id", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    // A hint, not an answer. **The directory's face is a visibility hazard**
    // and must resolve at read time: the preferred face if the viewer can see
    // it, otherwise the most recent visible item tagged with that person,
    // otherwise the ghost frame the surface already has.
    .addColumn("preferred_face_item_id", "text", (column) => {
      return column.references("items.id").onDelete("set null");
    })
    .addColumn("created_by", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // Partial, and it has to be. A plain `UNIQUE (member_id)` would reject
  // nothing useful here: most rows carry no account at all, SQLite counts
  // distinct nulls as distinct inside a unique index, and so every unlinked
  // person would be unique by construction while the constraint quietly
  // appeared to be doing work. Keyed on the rows that actually hold an id, it
  // does the one job it is for: two person records cannot claim one account.
  //
  // No unique on `display_name`, deliberately: two people really can share a
  // name, which is why ingest resolves a typed name to an id once per batch
  // and writes the id back rather than trusting the string.
  await database.schema
    .createIndex("people_member")
    .unique()
    .on("people")
    .column("member_id")
    .where("member_id", "is not", null)
    .execute();

  // **`person_id` is RESTRICT, and that differs from `item_tags.tag_id` on
  // purpose.** Deleting a person would silently strip them from hundreds of
  // photographs with no undo, and the removal-request flow depends on knowing
  // who is in a picture. The database refuses, and an explicit untag has to
  // come first. Deleting the *item* still cascades: `people` rows survive,
  // which is what keeps somebody findable after their only photograph comes
  // down.
  //
  // **`item_people` must never appear in a visibility expression.** Being in a
  // photograph is not a key to it. Nothing in the schema can enforce that, so
  // it is written here as well as in migration 0002.
  await database.schema
    .createTable("item_people")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    .addColumn("person_id", "text", (column) => {
      return column.notNull().references("people.id").onDelete("restrict");
    })
    .addColumn("tagged_by", "text", (column) => {
      return column.references("members.id").onDelete("set null");
    })
    .addColumn("tagged_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  await database.schema
    .createIndex("item_people_item_person")
    .unique()
    .on("item_people")
    .columns(["item_id", "person_id"])
    .execute();

  // Indexed both ways, for the same reason as `item_tags`: the people filter
  // and the person page both drive from this side. It is also what the
  // RESTRICT above reads to decide whether a person may be deleted.
  await database.schema
    .createIndex("item_people_person_item")
    .on("item_people")
    .columns(["person_id", "item_id"])
    .execute();
}

/**
 * Drops the ten tables, children before parents.
 *
 * `bursts` goes before `items` even though the two reference each other: by
 * then nothing else points at `bursts`, and emptying it only fires the SET
 * NULL on `items.burst_id`, which is still there to receive it.
 */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("item_people").execute();
  await database.schema.dropTable("people").execute();
  await database.schema.dropTable("item_tags").execute();
  await database.schema.dropTable("tags").execute();
  await database.schema.dropTable("item_capture_date_changes").execute();
  await database.schema.dropTable("item_milestones").execute();
  await database.schema.dropTable("milestones").execute();
  await database.schema.dropTable("bursts").execute();
  await database.schema.dropTable("item_renditions").execute();
  await database.schema.dropTable("items").execute();
}
