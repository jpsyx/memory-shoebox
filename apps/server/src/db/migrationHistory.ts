import { sql, type Kysely } from "kysely";
import type { MigrationSource } from "./migrationSources.ts";
import type { Database } from "./types/db.types.ts";

async function _assertChecksums(
  database: Kysely<Database>,
  sources: Readonly<Record<string, MigrationSource>>,
  names: readonly string[],
): Promise<void> {
  const checksums = (
    await sql<{
      name: string;
      checksum: string;
    }>`select name, checksum from kysely_migration_checksums order by name`.execute(
      database,
    )
  ).rows;
  if (
    checksums.length !== names.length ||
    checksums.some((row, index) => {
      return (
        row.name !== names[index] ||
        row.checksum !== sources[row.name]?.checksum
      );
    })
  ) {
    throw new Error(
      "Migration checksum history changed; restore the matching release",
    );
  }
}

/** Validates that applied migrations are an unchanged prefix of this release. */
export async function getMigrationHistoryFromDatabase(
  database: Kysely<Database>,
  sources: Readonly<Record<string, MigrationSource>>,
): Promise<{ names: string[]; isLegacy: boolean }> {
  const tables = (
    await sql<{
      name: string;
    }>`select name from sqlite_master where type = 'table' and name in ('kysely_migration', 'kysely_migration_checksums')`.execute(
      database,
    )
  ).rows.map((row) => {
    return row.name;
  });
  const names = tables.includes("kysely_migration")
    ? (
        await sql<{
          name: string;
        }>`select name from kysely_migration order by name`.execute(database)
      ).rows.map((row) => {
        return row.name;
      })
    : [];
  const available = Object.keys(sources).sort();
  if (
    names.some((name, index) => {
      return name !== available[index];
    })
  ) {
    throw new Error(
      "Migration history is not a prefix of this release; refusing upgrade",
    );
  }
  const isLegacy = !tables.includes("kysely_migration_checksums");
  if (!isLegacy) {
    await _assertChecksums(database, sources, names);
  }
  return { names, isLegacy };
}

/** Creates a compatible Kysely ledger and adopts validated legacy rows once. */
export async function initializeMigrationHistory(
  database: Kysely<Database>,
  sources: Readonly<Record<string, MigrationSource>>,
  history: Readonly<{ names: string[]; isLegacy: boolean }>,
): Promise<void> {
  await sql`create table if not exists kysely_migration (name varchar(255) primary key not null, timestamp varchar(255) not null)`.execute(
    database,
  );
  await sql`create table if not exists kysely_migration_checksums (name text primary key not null references kysely_migration(name), checksum text not null)`.execute(
    database,
  );
  if (history.isLegacy) {
    await history.names.reduce(async (previous, name) => {
      await previous;
      await sql`insert into kysely_migration_checksums (name, checksum) values (${name}, ${sources[name]!.checksum})`.execute(
        database,
      );
    }, Promise.resolve());
    if (history.names.length > 0) {
      console.warn(
        "Adopting legacy migration checksums: the first baseline cannot verify historical source bytes.",
      );
    }
  }
}

/** Writes a migration result inside the same transaction as its schema/data. */
export async function recordMigration(
  database: Kysely<Database>,
  name: string,
  checksum: string,
): Promise<void> {
  await sql`insert into kysely_migration (name, timestamp) values (${name}, ${new Date().toISOString()})`.execute(
    database,
  );
  await sql`insert into kysely_migration_checksums (name, checksum) values (${name}, ${checksum})`.execute(
    database,
  );
}
