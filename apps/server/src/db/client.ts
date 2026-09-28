import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { createId } from "./createId.ts";
import type { Database } from "./types/db.types.ts";

/** The in-memory database path, used by tests. */
const IN_MEMORY_PATH = ":memory:";

/**
 * Opens the SQLite catalog and returns a typed Kysely handle.
 *
 * Creates the parent directory when it is missing, so a first run against a
 * fresh Fly volume (or a fresh clone) works without a manual `mkdir`. Enables
 * write-ahead logging for concurrent reads during writes, and foreign key
 * enforcement, which SQLite leaves off by default.
 *
 * @param databasePath Filesystem path of the database file, or ":memory:".
 * @returns A Kysely handle. Call `destroy()` to close it.
 */
export function createDatabase(databasePath: string): Kysely<Database> {
  if (databasePath !== IN_MEMORY_PATH) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const sqlite = new SQLite(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // **The first-sign-in seed is why this exists.** Decision 3 seeds one
  // `item_views` row per existing item for a brand-new member, and `auth.md`
  // requires it to be one `INSERT ... SELECT`: a uuid minted per row in
  // application code turns one statement into roughly 17,000 round trips.
  // `item_views.id` is a uuid column with no default, so SQL has to be able to
  // mint one. It is `createId()` itself, so there is still one generator.
  sqlite.function("create_id", { deterministic: false }, () => {
    return createId();
  });

  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}
