import { sql, type Kysely } from "kysely";

/**
 * What the family says to each other about a photograph: comments, and the
 * two reaction tables.
 *
 * Three tables, and the shape of the group is the one thing to read before
 * changing it.
 *
 * **Two reaction tables, not one polymorphic table.** The rejected
 * alternative was a single `reactions` with `target_type` and `target_id`. It
 * loses on the property this product is unusually strict about: deletion is
 * hard and final, with no flag to fall back on. SQLite cannot declare a
 * foreign key against two tables, so a polymorphic reactions table has no
 * cascade at all, cleanup becomes application code or a trigger, and a missed
 * path leaves a row pointing at a dead uuid forever. An orphaned reaction
 * renders nothing and alerts nobody until somebody counts rows. Two tables buy
 * engine-enforced cleanup for the price of one duplicated four-column table,
 * and the polymorphism that actually matters is in the UI, where one component
 * already serves both. Do not merge them.
 *
 * **Deleting an item takes all of this with it**, and `comment_reactions` goes
 * **transitively**: the item cascades to its comments and each comment
 * cascades to its reactions. That transitive hop is exactly the cascade the
 * polymorphic table would not have given you
 * (`data-models.md` § Deleting an item: the cascade matrix).
 *
 * **No stored count of anything.** A reaction total is a per-viewer aggregate
 * like every other count in the product, because a hidden item "does not
 * appear, and it is not counted". The read path returns rows rather than
 * aggregates: the popover needs the names anyway, and at family scale the
 * aggregate is smaller than the list it summarises
 * (`data-models.md` § One rule that outranks the others).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // One comment on one item, optionally pinned to a moment in a video.
  //
  // **No visibility column.** A comment inherits its item's rule exactly.
  // Copying the rule here would be a second source of truth that can drift,
  // and the drift would show as a comment visible on an item that is not.
  //
  // **No `parent_comment_id`.** The thread is flat in both surfaces. The
  // notification line "a reply on something you posted or commented on" means
  // another top-level comment on the same item, not threading.
  await database.schema
    .createTable("comments")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // CASCADE, and it is the delete modal's own copy: "the three comments on
    // it go with it".
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    // RESTRICT, the opposite choice to the line above for the opposite
    // reason: cascading would let removing one relative silently erase a
    // decade of the family's conversation on photographs that stay up. It is
    // what makes the Members surface's promise true, that nothing somebody
    // wrote is deleted and their name stays on it. It never actually fires,
    // because a member is never hard-deleted: removal is a `status` change.
    .addColumn("author_member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    // Checked here rather than only at the boundary, because an empty comment
    // is not a comment and a whitespace-only body would render as a blank row
    // with a name and a time under it. The 4000-character limit is the API's,
    // not the database's.
    .addColumn("body", "text", (column) => {
      return column.notNull().check(sql`length(trim(body)) > 0`);
    })
    // `REAL` rather than an integer: the scrubber produces
    // `fraction * duration`, a float. The fixtures use whole seconds only
    // because they were typed by hand.
    //
    // Null except on a comment pinned to a moment, which is every comment on a
    // photograph. **No range check**, deliberately: the bound is
    // `items.duration_ms` on another row, which a SQLite column check cannot
    // reach, and the API clamps to `[0, duration_ms / 1000]` rather than
    // rejecting (`apis/items.md`).
    .addColumn("at_seconds", "real")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    // What the **edited** marker reads off, and it is not optional: a comment
    // that changes under a reader with no sign of it is worse than one that
    // cannot change at all. Null until the author edits (Decision 8).
    .addColumn("edited_at", "text")
    .execute();

  // The item viewer's whole comment read, in one index: the thread for an item
  // in the order it is printed. It also lends the CASCADE from `items` an
  // index, without which deleting one photograph scans every comment ever
  // written.
  await database.schema
    .createIndex("comments_item_created_at")
    .on("comments")
    .columns(["item_id", "created_at"])
    .execute();

  // One member's single reaction to one item.
  await database.schema
    .createTable("item_reactions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.notNull().references("items.id").onDelete("cascade");
    })
    // CASCADE, which differs from the RESTRICT on `comments.author_member_id`
    // above and is what the model asks for: a reaction is a gesture rather
    // than something somebody wrote, so it carries nothing worth keeping once
    // its author is gone. Like the RESTRICT, it never fires, because a member
    // is never hard-deleted.
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    // The canonical order of these six is the order they are written in, and
    // the server sorts by `(count DESC, canonical position ASC)`. The client
    // sorts by count with no tiebreak, so four loves and four cares would swap
    // places between page loads.
    .addColumn("kind", "text", (column) => {
      return column
        .notNull()
        .check(sql`kind IN ('like', 'love', 'care', 'haha', 'wow', 'sad')`);
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // The whole of "one per member per thing", and the shape every write to this
  // table depends on: leaving a second reaction is
  // `INSERT ... ON CONFLICT DO UPDATE SET kind = excluded.kind` and pressing
  // your own again is a `DELETE`. Both are one statement and both are point
  // lookups.
  //
  // Both columns are `NOT NULL`, which matters: SQLite counts distinct nulls
  // as distinct inside a unique index, so a composite unique over a sometimes
  // null column rejects nothing. That is why no partial index is needed here,
  // unlike `people_member` in migration 0003.
  //
  // It also gives the CASCADE from `items` its index.
  await database.schema
    .createIndex("item_reactions_item_member")
    .unique()
    .on("item_reactions")
    .columns(["item_id", "member_id"])
    .execute();

  // One member's single reaction to one comment. Identical to the table above
  // but for its parent: see the note at the head of this file for why the two
  // are not one table.
  await database.schema
    .createTable("comment_reactions")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // CASCADE, and it carries two promises at once: deleting a comment takes
    // its reactions with it (Decision 8), and deleting an *item* reaches these
    // rows through the comment.
    .addColumn("comment_id", "text", (column) => {
      return column.notNull().references("comments.id").onDelete("cascade");
    })
    .addColumn("member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("cascade");
    })
    .addColumn("kind", "text", (column) => {
      return column
        .notNull()
        .check(sql`kind IN ('like', 'love', 'care', 'haha', 'wow', 'sad')`);
    })
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();

  // As above, and it is also the index the item viewer's one batched read
  // drives: `WHERE comment_id IN (...)`, never one query per comment. That
  // N+1 is the easiest mistake in the item viewer.
  await database.schema
    .createIndex("comment_reactions_comment_member")
    .unique()
    .on("comment_reactions")
    .columns(["comment_id", "member_id"])
    .execute();
}

/**
 * Drops the three tables, children before parents: `comment_reactions` points
 * at `comments`, so it goes first.
 */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("comment_reactions").execute();
  await database.schema.dropTable("item_reactions").execute();
  await database.schema.dropTable("comments").execute();
}
