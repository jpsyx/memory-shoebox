import { sql, type Kysely } from "kysely";

/** Ordered neighbor probes without sorting whole days or burst memberships. */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX items_navigation_capture ON items
    (captured_on DESC, captured_at, seq, id)`.execute(database);
  await sql`CREATE INDEX items_navigation_burst_capture ON items
    (burst_id, captured_on, captured_at, seq, id)`.execute(database);
  await sql`CREATE INDEX items_navigation_burst_frame ON items
    (burst_id, burst_index, id)`.execute(database);
}
