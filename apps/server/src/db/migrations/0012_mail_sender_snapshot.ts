import type { Kysely } from "kysely";
import type { Database } from "../types/db.types.ts";

/** Leaves legacy rows intact; their next provider attempt freezes identity. */
export async function up(database: Kysely<Database>): Promise<void> {
  await database.schema
    .alterTable("outbound_emails")
    .addColumn("sender_snapshot_json", "text")
    .execute();
}
