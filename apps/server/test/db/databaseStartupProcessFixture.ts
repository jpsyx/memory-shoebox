import SQLite from "better-sqlite3";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";

const path = process.argv[2];
if (!path) {
  throw new Error("Missing database path");
}
const pragma = SQLite.prototype.pragma;
let hasReportedBusy = false;
SQLite.prototype.pragma = function (source, options) {
  try {
    return pragma.call(this, source, options);
  } catch (error) {
    if (
      source === "journal_mode = WAL" &&
      error instanceof SQLite.SqliteError &&
      error.code === "SQLITE_BUSY" &&
      !hasReportedBusy
    ) {
      hasReportedBusy = true;
      process.send?.("wal-busy");
    }
    throw error;
  }
};
try {
  const database = createDatabase(path);
  try {
    const journal = await sql<{
      journal_mode: string;
    }>`pragma journal_mode`.execute(database);
    const timeout = await sql<{ timeout: number }>`pragma busy_timeout`.execute(
      database,
    );
    const foreignKeys = await sql<{
      foreign_keys: number;
    }>`pragma foreign_keys`.execute(database);
    const rows = await sql<{
      title: string;
    }>`select title from memories`.execute(database);
    console.log(
      JSON.stringify({
        journal: journal.rows,
        timeout: timeout.rows,
        foreignKeys: foreignKeys.rows,
        memories: rows.rows,
      }),
    );
  } finally {
    await database.destroy();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  SQLite.prototype.pragma = pragma;
  process.disconnect?.();
}
