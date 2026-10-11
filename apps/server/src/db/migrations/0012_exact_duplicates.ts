import { sql, type Kysely } from "kysely";

/** Adds lookup and durable skip reasons without replacing any catalog rows. */
export async function up(database: Kysely<unknown>): Promise<void> {
  // Existing copies are valid history. A unique index would reject them.
  await database.schema
    .createIndex("items_checksum")
    .on("items")
    .column("checksum")
    .where("checksum", "is not", null)
    .execute();
  await database.schema
    .alterTable("upload_files")
    .addColumn("duplicate_reason", "text", (column) => {
      return column.check(sql`duplicate_reason in ('archive', 'batch')`);
    })
    .execute();
}
