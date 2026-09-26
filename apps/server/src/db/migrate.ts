import { fileURLToPath } from "node:url";
import {
  Migrator,
  type Kysely,
  type Migration,
  type MigrationProvider,
  type MigrationResult,
} from "kysely";
import { createDatabase } from "./client.ts";
import { migrations } from "./migrations/migrations.ts";
import type { Database } from "./types.ts";

const provider: MigrationProvider = {
  getMigrations: async (): Promise<Record<string, Migration>> => {
    return migrations;
  },
};

/**
 * Applies every pending migration to the given database.
 *
 * Takes a database handle rather than a path so tests can run it against an
 * in-memory database without touching configuration.
 *
 * @param database The database to migrate.
 * @returns One result per migration applied by this call. Empty when the
 *   database was already up to date.
 * @throws If a migration fails. The database is left at the last good version.
 */
export async function migrateToLatest(
  database: Kysely<Database>,
): Promise<MigrationResult[]> {
  const migrator = new Migrator({ db: database, provider });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
  return results ?? [];
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
