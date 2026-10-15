import { sql, type Kysely } from "kysely";

/** Bounds a viewer’s own-item visibility arm by the requested capture dates. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX items_uploaded_by_captured_on ON items
    (uploaded_by, captured_on)`.execute(database);
}
