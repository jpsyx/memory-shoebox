import { sql, type Kysely } from "kysely";

async function _addEvidenceColumns(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("items")
    .addColumn("visual_fingerprint", "text")
    .execute();
  await database.schema
    .alterTable("upload_files")
    .addColumn("visual_fingerprint", "text")
    .execute();
  await database.schema
    .alterTable("upload_files")
    .addColumn("pick_id", "text")
    .execute();
  await database.schema
    .createIndex("upload_files__session_pick")
    .on("upload_files")
    .columns(["upload_session_id", "pick_id"])
    .unique()
    .where("pick_id", "is not", null)
    .execute();
}

async function _addBackfillQueue(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("photo_fingerprint_backfill")
    .addColumn("item_id", "text", (column) => {
      return column
        .primaryKey()
        .notNull()
        .references("items.id")
        .onDelete("cascade");
    })
    .addColumn("attempts", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    .addColumn("next_attempt_at", "text", (column) => {
      return column.notNull();
    })
    .addColumn("last_error", "text")
    .execute();
  await database.schema
    .createIndex("photo_fingerprint_backfill_due")
    .on("photo_fingerprint_backfill")
    .columns(["next_attempt_at", "item_id"])
    .execute();
}

/** Installs visual lookup and resumable work without reading stored media. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await _addEvidenceColumns(database);
  await _addBackfillQueue(database);
  await [0, 1, 2, 3].reduce(async (previous, band) => {
    await previous;
    await sql`create index ${sql.id(`items_visual_fingerprint_band_${band}`)}
      on items(substr(visual_fingerprint, ${sql.lit(4 + 4 * band)}, 4))
      where kind = 'photo' and visual_fingerprint is not null`.execute(
      database,
    );
  }, Promise.resolve());
  await sql`insert into photo_fingerprint_backfill(item_id, next_attempt_at)
    select id, '1970-01-01T00:00:00.000Z' from items
    where kind = 'photo' and visual_fingerprint is null`.execute(database);
}
