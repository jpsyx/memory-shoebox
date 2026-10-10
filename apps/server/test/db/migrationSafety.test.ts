import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SQLite from "better-sqlite3";
import { sql, type Migration } from "kysely";
import { afterEach, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import type { MigrationSource } from "../../src/db/migrationSources.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";

const directories: string[] = [];
const databases: Array<ReturnType<typeof createDatabase>> = [];
afterEach(async () => {
  await Promise.all(
    databases.splice(0).map((database) => {
      return database.destroy();
    }),
  );
  directories.splice(0).forEach((directory) => {
    return rmSync(directory, { recursive: true, force: true });
  });
});
function _openDatabase(isDisk = false) {
  const directory = mkdtempSync(join(tmpdir(), "migration-safety-"));
  directories.push(directory);
  const path = join(directory, "catalog.db");
  const database = createDatabase(isDisk ? path : ":memory:");
  databases.push(database);
  return { database, directory, path };
}
function _source(migration: Migration, checksum = "original") {
  return { migration, checksum };
}
const first = _source({
  up: async (database) => {
    await sql`create table memories (title text primary key not null)`.execute(
      database,
    );
    await sql`insert into memories values ('family')`.execute(database);
  },
});
async function _getTitles(database: ReturnType<typeof createDatabase>) {
  return (
    await sql<{ title: string }>`select title from memories`.execute(database)
  ).rows;
}
it("rolls back all pending DDL, data, and history after an exception", async () => {
  const { database } = _openDatabase();
  await migrateToLatest(database, { sources: { "0001": first } });
  await expect(
    migrateToLatest(database, {
      sources: {
        "0001": first,
        "0002": _source({
          up: async (connection) => {
            await sql`insert into memories values ('pending migration')`.execute(
              connection,
            );
          },
        }),
        "0003": _source({
          up: async (connection) => {
            await sql`create table partial (id text)`.execute(connection);
            await sql`delete from memories`.execute(connection);
            throw new Error("injected failure");
          },
        }),
      },
    }),
  ).rejects.toThrow("injected failure");
  expect(await _getTitles(database)).toEqual([{ title: "family" }]);
  expect(
    (
      await sql`select name from sqlite_master where name = 'partial'`.execute(
        database,
      )
    ).rows,
  ).toEqual([]);
  expect(
    (await sql`select name from kysely_migration`.execute(database)).rows,
  ).toEqual([{ name: "0001" }]);
  expect((await sql`pragma foreign_keys`.execute(database)).rows).toEqual([
    { foreign_keys: 1 },
  ]);
});
it("rolls back schema and data when recording history fails", async () => {
  const { database } = _openDatabase();
  await migrateToLatest(database, { sources: { "0001": first } });
  await sql`create trigger refuse_history before insert on kysely_migration begin select raise(abort, 'history refused'); end`.execute(
    database,
  );
  await expect(
    migrateToLatest(database, {
      sources: {
        "0001": first,
        "0002": _source({
          up: async (connection) => {
            await sql`delete from memories`.execute(connection);
          },
        }),
      },
    }),
  ).rejects.toThrow("history refused");
  expect(await _getTitles(database)).toEqual([{ title: "family" }]);
});
it("rejects missing, reordered, and changed migration history", async () => {
  const { database } = _openDatabase();
  await migrateToLatest(database, { sources: { "0001": first } });
  const histories: Array<Record<string, MigrationSource>> = [
    {},
    { "0000": first, "0001": first },
    { "0001": _source(first.migration, "changed") },
  ];
  await Promise.all(
    histories.map(async (sources) => {
      await expect(migrateToLatest(database, { sources })).rejects.toThrow(
        /history|checksum/i,
      );
    }),
  );
});
it("rejects foreign key violations before and after migration and restores enforcement", async () => {
  const { database } = _openDatabase();
  await migrateToLatest(database, { sources: { "0001": first } });
  const broken = _source({
    up: async (connection) => {
      await sql`create table children (parent text references memories(title))`.execute(
        connection,
      );
      await sql`insert into children values ('missing')`.execute(connection);
    },
  });
  await expect(
    migrateToLatest(database, { sources: { "0001": first, "0002": broken } }),
  ).rejects.toThrow(/foreign key/i);
  expect((await sql`pragma foreign_keys`.execute(database)).rows).toEqual([
    { foreign_keys: 1 },
  ]);
  expect(
    (
      await sql`select name from sqlite_master where name = 'children'`.execute(
        database,
      )
    ).rows,
  ).toEqual([]);
});
it("backs up committed WAL rows before upgrading, and skips backups on a no-op", async () => {
  const { database, directory } = _openDatabase(true);
  await migrateToLatest(database, { sources: { "0001": first } });
  await sql`insert into memories values ('WAL photo')`.execute(database);
  const before = readdirSync(join(directory, "backups"));
  await migrateToLatest(database, { sources: { "0001": first } });
  expect(readdirSync(join(directory, "backups"))).toEqual(before);
  await migrateToLatest(database, {
    sources: {
      "0001": first,
      "0002": _source({
        up: async (connection) => {
          await sql`delete from memories`.execute(connection);
        },
      }),
    },
  });
  const backupName = readdirSync(join(directory, "backups")).find((name) => {
    return !before.includes(name);
  })!;
  const backup = new SQLite(join(directory, "backups", backupName));
  expect(backup.prepare("select title from memories").all()).toEqual([
    { title: "family" },
    { title: "WAL photo" },
  ]);
  expect(backup.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
  backup.close();
});
it("aborts before database mutation if the backup cannot be created", async () => {
  const { database, directory } = _openDatabase(true);
  writeFileSync(join(directory, "backups"), "not a directory");
  await expect(
    migrateToLatest(database, { sources: { "0001": first } }),
  ).rejects.toThrow();
  expect(
    (
      await sql`select name from sqlite_master where type = 'table'`.execute(
        database,
      )
    ).rows,
  ).toEqual([]);
});
it("fails preflight on existing foreign key damage without adopting history", async () => {
  const { database } = _openDatabase();
  await sql`pragma foreign_keys = off`.execute(database);
  await sql`create table parent (id text primary key)`.execute(database);
  await sql`create table child (parent_id text references parent(id))`.execute(
    database,
  );
  await sql`insert into child values ('missing')`.execute(database);
  await expect(
    migrateToLatest(database, { sources: { "0001": first } }),
  ).rejects.toThrow(/foreign key/i);
  expect(
    (
      await sql`select name from sqlite_master where name = 'kysely_migration'`.execute(
        database,
      )
    ).rows,
  ).toEqual([]);
  expect((await sql`pragma foreign_keys`.execute(database)).rows).toEqual([
    { foreign_keys: 1 },
  ]);
});
it("rejects existing CHECK damage during integrity preflight", async () => {
  const { database } = _openDatabase();
  await sql`create table damaged (value integer check (value > 0))`.execute(
    database,
  );
  await sql`pragma ignore_check_constraints = on`.execute(database);
  await sql`insert into damaged values (-1)`.execute(database);
  await sql`pragma ignore_check_constraints = off`.execute(database);
  await expect(
    migrateToLatest(database, { sources: { "0001": first } }),
  ).rejects.toThrow(/integrity/i);
  expect(
    (
      await sql`select name from sqlite_master where name = 'memories'`.execute(
        database,
      )
    ).rows,
  ).toEqual([]);
});
it("adopts legacy Kysely rows once and refuses a later missing checksum", async () => {
  const { database } = _openDatabase();
  await first.migration.up(database);
  await sql`create table kysely_migration (name text primary key, timestamp text not null)`.execute(
    database,
  );
  await sql`insert into kysely_migration values ('0001', '2026-01-01')`.execute(
    database,
  );
  expect(
    await migrateToLatest(database, { sources: { "0001": first } }),
  ).toEqual([]);
  await sql`delete from kysely_migration_checksums`.execute(database);
  await expect(
    migrateToLatest(database, { sources: { "0001": first } }),
  ).rejects.toThrow(/checksum/i);
  expect(await _getTitles(database)).toEqual([{ title: "family" }]);
});
