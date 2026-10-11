import { sql, type Kysely } from "kysely";
import type { Database } from "../types/db.types.ts";

/** Saves original grouping independently of the active burst's lifetime. */
export async function up(database: Kysely<Database>): Promise<void> {
  await sql`CREATE TABLE item_burst_history (
    item_id TEXT NOT NULL PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    burst_id TEXT NOT NULL,
    burst_index INTEGER NOT NULL,
    upload_session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE RESTRICT,
    captured_on TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    detector_version INTEGER,
    threshold_seconds INTEGER,
    detected_at TEXT NOT NULL,
    is_manual INTEGER NOT NULL,
    cover_item_id TEXT REFERENCES items(id) ON DELETE SET NULL
  )`.execute(database);
  await sql`CREATE INDEX item_burst_history__burst ON item_burst_history(burst_id)`.execute(
    database,
  );
  await sql`CREATE INDEX item_burst_history__session ON item_burst_history(upload_session_id)`.execute(
    database,
  );
  await sql`CREATE INDEX item_burst_history__cover ON item_burst_history(cover_item_id)`.execute(
    database,
  );
  await sql`INSERT INTO item_burst_history
    SELECT items.id, bursts.id, items.burst_index, bursts.upload_session_id,
      bursts.captured_on, bursts.starts_at, bursts.ends_at,
      bursts.detector_version, bursts.threshold_seconds, bursts.detected_at,
      bursts.is_manual, bursts.cover_item_id
    FROM items JOIN bursts ON bursts.id = items.burst_id
    WHERE items.burst_index IS NOT NULL`.execute(database);
  await database.schema
    .alterTable("upload_files")
    .addColumn("burst_excluded", "integer", (column) => {
      return column.notNull().defaultTo(0);
    })
    .execute();
}
