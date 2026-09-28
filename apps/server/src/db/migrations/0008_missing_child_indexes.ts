import type { Kysely } from "kysely";

/**
 * Two indexes that belong to tables migration 0003 created, and are separate
 * only because 0003 had already shipped.
 *
 * No tables, no columns: this migration adds nothing the `Database` type can
 * see. It closes the last two instances of the pattern four earlier migrations
 * each found independently and each wrote down, citing the others:
 * `bursts_cover_item` (0003), `removal_requests__by_item` (0005),
 * `upload_files__by_item` (0006) and `activity_events__by_device` (0007). **An
 * unindexed child column whose parent can be deleted turns that delete into a
 * full table scan**, because SQLite has to find the referencing rows and has
 * nothing to find them with. The scan is invisible in every test and on every
 * small database, and it grows with the archive.
 *
 * The two that were missed differ from those four in which delete rule they
 * carry, which is why they read as safe and are not.
 *
 * **`bursts.upload_session_id` is `RESTRICT`.** A `RESTRICT` still has to look:
 * before refusing, or permitting, a session delete SQLite must know whether a
 * burst references it. So a session purge, which is the operation `RESTRICT`
 * exists to order, scans every burst row. `bursts` grows with the archive.
 * The column is `NOT NULL`, so the index is a plain one.
 *
 * **`item_capture_date_changes.milestone_id` is `SET NULL`**, and
 * `DELETE /api/milestones/:milestoneId` promises that nothing blocks it. That
 * promise is kept by firing the `SET NULL` against a table which grows with
 * the archive: one timezone change writes one row per affected item. The
 * table's only other index leads with `item_id` and so cannot serve this at
 * all. Partial, for the reason `activity_events__by_device` is partial: only a
 * `milestone_reconcile` row carries a milestone at all, every manual and
 * timezone-change row leaves the column null, and the null rows are exactly
 * the ones this index would never have anything to find in.
 *
 * **On the names.** This schema has two naming forms, a single underscore in
 * 0001 to 0004 (`bursts_cover_item`) and a double in 0005 to 0007
 * (`removal_requests__by_item`). Both indexes here belong to tables 0003
 * created, so both take 0003's single-underscore form: an index reads next to
 * the other indexes on its table, not next to the migration that happened to
 * add it.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createIndex("bursts_upload_session")
    .on("bursts")
    .column("upload_session_id")
    .execute();

  await database.schema
    .createIndex("item_capture_date_changes_milestone")
    .on("item_capture_date_changes")
    .column("milestone_id")
    .where("milestone_id", "is not", null)
    .execute();
}

/** Drops both indexes, leaving the tables 0003 built untouched. */
export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropIndex("item_capture_date_changes_milestone")
    .on("item_capture_date_changes")
    .execute();
  await database.schema
    .dropIndex("bursts_upload_session")
    .on("bursts")
    .execute();
}
