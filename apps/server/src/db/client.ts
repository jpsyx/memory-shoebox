import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { registerCreateId } from "./createId.ts";
import type { Database } from "./types/db.types.ts";

/** The in-memory database path, used by tests. */
const IN_MEMORY_PATH = ":memory:";
/** Preserve better-sqlite3's normal lock wait after WAL initialization. */
const DATABASE_BUSY_TIMEOUT_MS = 5000;

function _enableWal(sqlite: SQLite.Database): void {
  const deadline = performance.now() + DATABASE_BUSY_TIMEOUT_MS;
  const waitSignal = new Int32Array(new SharedArrayBuffer(4));
  // WAL lock upgrades can return BUSY without invoking SQLite's busy handler.
  while (true) {
    try {
      sqlite.pragma("journal_mode = WAL");
      return;
    } catch (error) {
      const remainingMs = deadline - performance.now();
      if (
        !(error instanceof SQLite.SqliteError) ||
        error.code !== "SQLITE_BUSY" ||
        remainingMs <= 0
      ) {
        throw error;
      }
      Atomics.wait(waitSignal, 0, 0, Math.min(10, remainingMs));
      if (performance.now() >= deadline) {
        throw error;
      }
    }
  }
}

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

  const sqlite = new SQLite(databasePath, { timeout: 0 });
  try {
    _enableWal(sqlite);
    sqlite.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);
    sqlite.pragma("foreign_keys = ON");
    registerCreateId(sqlite);
    return new Kysely<Database>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
