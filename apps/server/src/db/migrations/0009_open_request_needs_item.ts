import { sql, type Kysely } from "kysely";

/**
 * One `CHECK` on `removal_requests`: an open request must name a photograph.
 *
 * ```sql
 * CHECK (state <> 'open' OR item_id IS NOT NULL)
 * ```
 *
 * **What it repairs.** `item_id` is `SET NULL`, deliberately and uniquely in
 * this schema, so that takedown history survives the takedown
 * (`data-models.md` § `removal_requests`). The price is that
 * `removal_requests__one_open_per_asker`, the partial unique on
 * `(item_id, requested_by_member_id) WHERE state = 'open'`, stops enforcing
 * anything the moment `item_id` goes null: SQLite counts distinct nulls as
 * distinct inside a unique index, so `(NULL, 'ines')` never collides with
 * `(NULL, 'ines')`. Proven while building migration 0005: after deleting a
 * real item and letting the `SET NULL` fire on an open request, the same
 * asker took three simultaneously open requests, all accepted. Within
 * `state = 'open'` this `CHECK` makes `item_id` never null, which restores
 * the partial unique to full strength.
 *
 * **This is a backstop, not the mechanism.** The delete path must still settle
 * every open request for an item in the same transaction as the delete, as
 * `data-models.md` says it does. A `CHECK` violation surfacing from inside a
 * cascade is a poor error for a person to meet: it names a constraint, not the
 * photograph they were trying to remove. The constraint exists so that a
 * handler which forgets fails loudly instead of leaving rows that no
 * constraint can police, not so that handlers can stop settling requests.
 *
 * **Why the whole table is rebuilt.** SQLite has no
 * `ALTER TABLE ... ADD CONSTRAINT`, so adding a `CHECK` means SQLite's
 * documented twelve-step procedure: create the replacement under a temporary
 * name, copy the rows, drop the original, rename, recreate every index. The
 * table body below is migration 0005's verbatim, plus the one new constraint;
 * the reasons for each column and each index live there and are not repeated.
 *
 * **Foreign keys are disabled around the rebuild**, per step 1, and re-enabled
 * per step 12. `client.ts` turns them on for every connection, and with them
 * on, `DROP TABLE` runs an implicit `DELETE FROM` that fires delete actions on
 * anything referencing the table. Nothing references `removal_requests` today,
 * so leaving them on would appear to work; step 1 exists so that this stays
 * true of a schema that later grows a child. `PRAGMA foreign_keys` is a no-op
 * inside a transaction, so it is issued before the transaction opens, which
 * Kysely permits because its SQLite adapter reports no transactional DDL and
 * therefore does not wrap migrations in one. Step 10's `PRAGMA
 * foreign_key_check` runs inside the transaction, so a rebuild that broke a
 * reference rolls back rather than committing.
 *
 * `PRAGMA legacy_alter_table` is deliberately left at its default, off. It
 * exists for the procedure SQLite's own documentation marks incorrect, the one
 * that renames the original out of the way first: since 3.26.0 that rename
 * rewrites every `REFERENCES` clause pointing at the table, so the old name
 * follows it and the children end up pointing at a table that is about to be
 * dropped. The procedure below never renames the original, so there is nothing
 * for the pragma to protect against, and turning it on would only suppress the
 * rename fix-ups that a correct rebuild wants.
 */

/** The table being rebuilt. */
const TABLE_NAME = "removal_requests";

/**
 * The temporary name the replacement is created under.
 *
 * Step 4 of the procedure: the replacement is built under a name of its own
 * and renamed into place at step 7. Nothing references this name, so the
 * rename at step 7 has no `REFERENCES` clauses to rewrite.
 */
const REBUILD_TABLE_NAME = "new_removal_requests";

/** The constraint this migration exists to add. */
const OPEN_NEEDS_ITEM_CONSTRAINT = "removal_requests_open_has_item";

/**
 * Creates the replacement table under its temporary name.
 *
 * Every column, foreign key and check is migration 0005's, unchanged. The one
 * difference is the constraint named above, which `up` adds and `down` does
 * not.
 *
 * @param database The migration's handle, or the transaction wrapping it.
 * @param hasOpenNeedsItemCheck Whether to add the new `CHECK`.
 */
async function _createRebuiltTable(
  database: Kysely<unknown>,
  hasOpenNeedsItemCheck: boolean,
): Promise<void> {
  const table = database.schema
    .createTable(REBUILD_TABLE_NAME)
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("item_id", "text", (column) => {
      return column.references("items.id").onDelete("set null");
    })
    .addColumn("requested_by_member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    .addColumn("reason", "text")
    .addColumn("state", "text", (column) => {
      return column
        .notNull()
        .check(sql`state IN ('open', 'deleted', 'declined', 'withdrawn')`);
    })
    .addColumn("decline_reason", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("resolved_at", "text")
    .addColumn("resolved_by_member_id", "text", (column) => {
      return column.references("members.id").onDelete("restrict");
    })
    .addColumn("item_uploader_member_id", "text", (column) => {
      return column.notNull().references("members.id").onDelete("restrict");
    })
    .addColumn("item_captured_at", "text")
    .addColumn("item_storage_key", "text")
    .addCheckConstraint(
      "removal_requests_resolves_once",
      sql`(state = 'open') = (resolved_at IS NULL)`,
    )
    .addCheckConstraint(
      "removal_requests_decline_has_reason",
      sql`state <> 'declined' OR decline_reason IS NOT NULL`,
    );

  await (
    hasOpenNeedsItemCheck
      ? table.addCheckConstraint(
          OPEN_NEEDS_ITEM_CONSTRAINT,
          sql`state <> 'open' OR item_id IS NOT NULL`,
        )
      : table
  ).execute();
}

/**
 * Step 5: copies every row from the original into the replacement.
 *
 * Every deployment's table is empty, because nothing has shipped, but a copy
 * step that only works on an empty table is a trap for whoever runs this
 * against one that is not. The columns are named on both sides rather than
 * relying on `SELECT *`, so the copy is pinned to the column order this
 * migration wrote rather than to whatever order the source happens to have.
 *
 * A row that violates the new `CHECK` fails here, which is the intended
 * behaviour: an open request with no photograph is exactly what the
 * constraint exists to refuse, and rewriting it silently would be a worse
 * answer than a failed migration.
 */
async function _copyRows(database: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO ${sql.table(REBUILD_TABLE_NAME)} (
      id, item_id, requested_by_member_id, reason, state, decline_reason,
      created_at, resolved_at, resolved_by_member_id, item_uploader_member_id,
      item_captured_at, item_storage_key
    )
    SELECT
      id, item_id, requested_by_member_id, reason, state, decline_reason,
      created_at, resolved_at, resolved_by_member_id, item_uploader_member_id,
      item_captured_at, item_storage_key
    FROM ${sql.table(TABLE_NAME)}
  `.execute(database);
}

/**
 * Step 8: rebuilds all four indexes migration 0005 declared.
 *
 * `DROP TABLE` takes a table's indexes with it, so every one has to be written
 * again, predicates included. Two are partial and both are load-bearing:
 * `__one_open_per_asker` for correctness, since a full unique would forbid
 * "Ask again" after a decline, and `__by_item` for size, since a null
 * `item_id` is exactly the case that index has nothing to find.
 */
async function _createIndexes(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createIndex("removal_requests__one_open_per_asker")
    .unique()
    .on(TABLE_NAME)
    .columns(["item_id", "requested_by_member_id"])
    // `state` is not one of the index's own columns, so Kysely's typed `where`
    // cannot reach it; `sql.ref` is the escape hatch, as in 0005.
    .where(sql.ref("state"), "=", "open")
    .execute();

  await database.schema
    .createIndex("removal_requests__open_by_uploader")
    .on(TABLE_NAME)
    .columns(["item_uploader_member_id", "state", "created_at"])
    .execute();

  await database.schema
    .createIndex("removal_requests__by_state")
    .on(TABLE_NAME)
    .columns(["state", "created_at"])
    .execute();

  await database.schema
    .createIndex("removal_requests__by_item")
    .on(TABLE_NAME)
    .column("item_id")
    .where("item_id", "is not", null)
    .execute();
}

/** One row of `PRAGMA foreign_key_check`, which reports only violations. */
type ForeignKeyViolation = {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
};

/**
 * Step 10: verifies the rebuild broke no foreign key.
 *
 * Foreign keys are off for the duration, so nothing else would notice a
 * reference the copy failed to carry. Throwing here rolls the transaction
 * back, which is the whole reason step 10 sits inside it.
 */
async function _assertNoForeignKeyViolations(
  database: Kysely<unknown>,
): Promise<void> {
  const result = await sql<ForeignKeyViolation>`
    PRAGMA foreign_key_check
  `.execute(database);
  if (result.rows.length > 0) {
    const summary = result.rows
      .map((row) => {
        return `${row.table} -> ${row.parent}`;
      })
      .join(", ");
    throw new Error(
      `Rebuilding ${TABLE_NAME} broke ${result.rows.length} foreign key reference(s): ${summary}`,
    );
  }
}

/**
 * Runs SQLite's twelve-step table rebuild against `removal_requests`.
 *
 * @param database The migration's handle.
 * @param hasOpenNeedsItemCheck Whether the rebuilt table carries the new
 *   `CHECK`. True going up, false coming back down.
 */
async function _rebuildRemovalRequests(
  database: Kysely<unknown>,
  hasOpenNeedsItemCheck: boolean,
): Promise<void> {
  // Step 1. Outside the transaction, where the pragma is not a no-op.
  await sql`PRAGMA foreign_keys = OFF`.execute(database);
  try {
    // Step 2. Steps 3 and 9 are empty: this table has no triggers and no
    // views, and its indexes are written out in full below rather than read
    // back from the catalog.
    await database.transaction().execute(async (transaction) => {
      await _createRebuiltTable(transaction, hasOpenNeedsItemCheck);
      await _copyRows(transaction);
      await transaction.schema.dropTable(TABLE_NAME).execute();
      await transaction.schema
        .alterTable(REBUILD_TABLE_NAME)
        .renameTo(TABLE_NAME)
        .execute();
      await _createIndexes(transaction);
      await _assertNoForeignKeyViolations(transaction);
    });
  } finally {
    // Step 12, in a `finally` so that a failed rebuild still hands the
    // connection back with foreign keys enforced.
    await sql`PRAGMA foreign_keys = ON`.execute(database);
  }
}

/** Rebuilds `removal_requests` with the `CHECK` described at the top. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await _rebuildRemovalRequests(database, true);
}

/**
 * Rebuilds `removal_requests` without the `CHECK`, leaving migration 0005's
 * table exactly as it was.
 */
export async function down(database: Kysely<unknown>): Promise<void> {
  await _rebuildRemovalRequests(database, false);
}
