import { sql, type Kysely } from "kysely";

/**
 * One request that a photograph come down, and the record of how it was
 * settled.
 *
 * One table, and its constraints are the subtlest in the schema.
 *
 * **`item_id` is `SET NULL`, the single exception to cascade anywhere in the
 * schema.** Everything else that references `items` cascades. The commonest
 * way a removal request ends is that somebody deletes the item, and a
 * `CASCADE` here would destroy the request in exactly the case where the
 * record matters most: the settled tab would be permanently empty of
 * deletions. `RESTRICT` is worse still, because deleting *is* the resolution,
 * so it would make resolving impossible
 * (`data-models.md` § Deleting an item: the cascade matrix).
 *
 * **The three `item_*` columns are a snapshot taken at request time**, not a
 * join. They are what lets a settled request still render once the
 * photograph is gone: `item_uploader_member_id` in particular is what the
 * uploader's queue is scoped by, never a join to `items`, or a deleted item
 * would silently drop it from their own resolved history.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("removal_requests")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    // SET NULL: see the note at the head of this file. The snapshot columns
    // below carry what a settled card still renders once this goes null.
    .addColumn("item_id", "text", (column) => {
      return column.references("items.id").onDelete("set null");
    })
    // RESTRICT, the same choice as `comments.author_member_id`: it never
    // fires, because a member is never hard-deleted, and the asker's identity
    // is part of the record.
    .addColumn("requested_by_member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    // Optional by design, unlike `decline_reason` below.
    .addColumn("reason", "text")
    .addColumn("state", "text", (column) => {
      return column
        .notNull()
        .check(sql`state IN ('open', 'deleted', 'declined', 'withdrawn')`);
    })
    // Compulsory on a decline, checked below against `state`.
    .addColumn("decline_reason", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    // Null exactly while `state = 'open'`, checked below. This is what makes
    // a request resolve exactly once, enforced by the database rather than by
    // a handler.
    .addColumn("resolved_at", "text")
    // Not necessarily the uploader: an admin can act first. RESTRICT, the
    // same choice as `requested_by_member_id`, because this is an identity
    // fact about who resolved the request, not incidental attribution.
    .addColumn("resolved_by_member_id", "text", (column) => {
      return column.references("members.id").onDelete("restrict");
    })
    // Snapshot at request time, so the uploader's queue can be scoped by this
    // column rather than by a join to `items` that a deleted item would drop.
    // RESTRICT for the same reason as `items.uploaded_by`: deletion rights and
    // routing both read it, and it must survive as long as this row does.
    .addColumn("item_uploader_member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    // Snapshot. No foreign key: this is a copied value, not a live reference.
    .addColumn("item_captured_at", "text")
    // Snapshot, so a settled request can be correlated with a backup even
    // after the object itself is gone. No foreign key: a copied value.
    .addColumn("item_storage_key", "text")
    // An equivalence, not an implication: `state = 'open'` if and only if
    // `resolved_at IS NULL`. A `CHECK` catches both directions, an open
    // request carrying a `resolved_at` and a settled one missing it.
    .addCheckConstraint(
      "removal_requests_resolves_once",
      sql`(state = 'open') = (resolved_at IS NULL)`,
    )
    // A decline must carry a reason. `reason` above stays optional; this one
    // does not.
    .addCheckConstraint(
      "removal_requests_decline_has_reason",
      sql`state <> 'declined' OR decline_reason IS NOT NULL`,
    )
    .execute();

  // One person cannot have two open requests on one photograph, but a
  // declined request offers "Ask again", which a plain unique would forbid.
  //
  // **Must be partial.** `item_id` is nullable, and SQLite counts distinct
  // nulls as distinct inside a unique index, so a plain
  // `UNIQUE (item_id, requested_by_member_id)` would both fail to reject a
  // second open request after the item is deleted (never actually a risk,
  // since a deleted item's requests are no longer open) and, more to the
  // point, would forbid asking again after a withdrawal, which is exactly the
  // behaviour the partial `WHERE state = 'open'` exists to allow.
  await database.schema
    .createIndex("removal_requests__one_open_per_asker")
    .unique()
    .on("removal_requests")
    .columns(["item_id", "requested_by_member_id"])
    // `state` is not one of the index's own columns, so Kysely's typed
    // `where` (which only accepts columns already declared above) cannot
    // reach it; `sql.ref` is the escape hatch the library's own docs show.
    .where(sql.ref("state"), "=", "open")
    .execute();

  // The uploader's queue: "requests on things I uploaded", scoped by the
  // snapshot column rather than a join, ordered oldest first within a state.
  await database.schema
    .createIndex("removal_requests__open_by_uploader")
    .on("removal_requests")
    .columns(["item_uploader_member_id", "state", "created_at"])
    .execute();

  // The admin queue, across every uploader.
  await database.schema
    .createIndex("removal_requests__by_state")
    .on("removal_requests")
    .columns(["state", "created_at"])
    .execute();

  // The reverse lookup from an item to its requests, and what lends the
  // `SET NULL` an index: without it, deleting an item scans every request
  // ever filed. Partial because a null `item_id` is exactly the case this
  // index has nothing to find.
  await database.schema
    .createIndex("removal_requests__by_item")
    .on("removal_requests")
    .column("item_id")
    .where("item_id", "is not", null)
    .execute();
}

/** Drops the one table. */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("removal_requests").execute();
}
