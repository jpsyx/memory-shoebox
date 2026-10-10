import { fileURLToPath } from "node:url";
import { sql, type Kysely, type MigrationResult } from "kysely";
import { createDatabase } from "./client.ts";
import { backupMigrationDatabase } from "./backupDatabase.ts";
import {
  getMigrationHistoryFromDatabase,
  initializeMigrationHistory,
  recordMigration,
} from "./migrationHistory.ts";
import {
  getMigrationSourcesFromFiles,
  type MigrationSource,
} from "./migrationSources.ts";
import type { Database } from "./types/db.types.ts";

/** Checks physical integrity and references before writes and before commit. */
async function _assertValidDatabase(database: Kysely<Database>): Promise<void> {
  const integrity = await sql<{
    integrity_check: string;
  }>`pragma integrity_check`.execute(database);
  if (
    integrity.rows.length !== 1 ||
    integrity.rows[0]?.integrity_check !== "ok"
  ) {
    throw new Error(
      "Database integrity check failed; restore a verified backup",
    );
  }
  if (
    (await sql`pragma foreign_key_check`.execute(database)).rows.length !== 0
  ) {
    throw new Error("Database foreign key check failed; refusing migration");
  }
}

async function _applyPending(
  database: Kysely<Database>,
  sources: Readonly<Record<string, MigrationSource>>,
): Promise<MigrationResult[]> {
  await _assertValidDatabase(database);
  const history = await getMigrationHistoryFromDatabase(database, sources);
  const pending = Object.keys(sources).sort().slice(history.names.length);
  if (pending.length === 0 && !history.isLegacy) {
    return [];
  }
  await backupMigrationDatabase(database);
  await initializeMigrationHistory(database, sources, history);
  const results: MigrationResult[] = [];
  await pending.reduce(async (previous, name) => {
    await previous;
    const source = sources[name]!;
    await source.migration.up(database);
    await recordMigration(database, name, source.checksum);
    results.push({ migrationName: name, direction: "Up", status: "Success" });
  }, Promise.resolve());
  await _assertValidDatabase(database);
  return results;
}

/**
 * Atomically applies pending migrations and history under SQLite's write lock.
 * Sources can be supplied to exercise historical subsets and failure fixtures.
 * Migration implementations must not manage transactions or external effects.
 */
export async function migrateToLatest(
  database: Kysely<Database>,
  options?: Readonly<{ sources: Readonly<Record<string, MigrationSource>> }>,
): Promise<MigrationResult[]> {
  const sources = options?.sources ?? (await getMigrationSourcesFromFiles());
  return database.connection().execute(async (connection) => {
    await sql`pragma foreign_keys = off`.execute(connection);
    let hasTransaction = false;
    try {
      await sql`begin immediate`.execute(connection);
      hasTransaction = true;
      const results = await _applyPending(connection, sources);
      await sql`commit`.execute(connection);
      hasTransaction = false;
      return results;
    } catch (error) {
      if (hasTransaction) {
        await sql`rollback`.execute(connection);
      }
      throw error;
    } finally {
      await sql`pragma foreign_keys = on`.execute(connection);
    }
  });
}

/** Runs migrations against the configured database, then exits. */
async function _runCli(): Promise<void> {
  const databasePath =
    process.env["DATABASE_PATH"] ?? "./data/memory-shoebox.db";
  const database = createDatabase(databasePath);
  const results = await migrateToLatest(database);
  results.forEach((result) => {
    console.log(`migration ${result.migrationName}: ${result.status}`);
  });
  console.log(
    results.length === 0
      ? `${databasePath} is already up to date`
      : `${databasePath} migrated (${results.length} applied)`,
  );
  await database.destroy();
}

// Only run when invoked directly (`pnpm migrate`), not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  _runCli().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
