import SQLite from "better-sqlite3";
import { sql } from "kysely";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { backupDatabase } from "../../src/db/backupDatabase.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";
type HistoricalCatalog = {
  database: ReturnType<typeof createDatabase>;
  directory: string;
  path: string;
  sources: Awaited<ReturnType<typeof getMigrationSourcesFromFiles>>;
  itemId: string;
  renditionId: string;
};

async function _openHistoricalCatalog(): Promise<HistoricalCatalog> {
  const directory = mkdtempSync(join(tmpdir(), "processing-upgrade-"));
  const path = join(directory, "catalog.db");
  const database = createDatabase(path);
  onTestFinished(async () => {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });
  const sources = await getMigrationSourcesFromFiles();
  const historical = Object.fromEntries(
    Object.entries(sources).filter(([name]) => {
      return name < "0017";
    }),
  );
  await migrateToLatest(database, { sources: historical });
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const renditionId = await insertRendition(database, {
    itemId,
    purpose: "original",
  });
  await insertRendition(database, { itemId, purpose: "display" });
  await insertComment(database, { itemId, authorMemberId: memberId });
  await sql`create table rendition_children (rendition_id text references item_renditions(id) on delete restrict)`.execute(
    database,
  );
  await sql`insert into rendition_children values (${renditionId})`.execute(
    database,
  );
  return { database, directory, path, sources, itemId, renditionId };
}

it("preserves catalog through purpose expansion", async () => {
  const { database, itemId, renditionId } = await _openHistoricalCatalog();
  const snapshot = async () => {
    return Promise.all(
      ["items", "item_renditions", "comments", "rendition_children"].map(
        async (table) => {
          return (
            await sql`select * from ${sql.table(table)}`.execute(database)
          ).rows;
        },
      ),
    );
  };
  const originalRowsBefore = await snapshot();
  const indexesBefore = (
    await sql`select name, sql from sqlite_master where type = 'index' and tbl_name = 'item_renditions' order by name`.execute(
      database,
    )
  ).rows;
  await migrateToLatest(database);
  const originalRowsAfter = await snapshot();
  const foreignKeyViolations = (
    await sql`pragma foreign_key_check`.execute(database)
  ).rows;
  expect(originalRowsAfter).toEqual(originalRowsBefore);
  expect(foreignKeyViolations).toEqual([]);
  expect(
    (
      await sql`select name, sql from sqlite_master where type = 'index' and tbl_name = 'item_renditions' order by name`.execute(
        database,
      )
    ).rows,
  ).toEqual(indexesBefore);
  await Promise.all(
    ["display_small", "display_webp", "display_small_webp"].map((purpose) => {
      return insertRendition(database, { itemId, purpose });
    }),
  );
  await expect(
    insertRendition(database, { itemId, purpose: "display_small" }),
  ).rejects.toThrow(/unique/i);
  await expect(
    database
      .deleteFrom("item_renditions")
      .where("id", "=", renditionId)
      .execute(),
  ).rejects.toThrow(/foreign key/i);
  await expect(
    insertRendition(database, { itemId, purpose: "unsupported" }),
  ).rejects.toThrow(/check/i);
});

it("backs up the populated catalog before rebuilding and keeps existing checksums", async () => {
  const { database, directory, sources } = await _openHistoricalCatalog();
  const rows = await database
    .selectFrom("item_renditions")
    .selectAll()
    .orderBy("id")
    .execute();
  const history = (
    await sql`select * from kysely_migration_checksums order by name`.execute(
      database,
    )
  ).rows;
  const existingBackups = readdirSync(join(directory, "backups"));
  const results = await migrateToLatest(database);
  expect(
    results.map((result) => {
      return result.migrationName;
    }),
  ).toEqual(["0017_media_processing", "0018_timeline_uploader_capture"]);
  const backupNames = readdirSync(join(directory, "backups")).filter((name) => {
    if (existingBackups.includes(name)) {
      return false;
    }
    const backup = new SQLite(join(directory, "backups", name), {
      readonly: true,
    });
    try {
      return (
        backup
          .prepare(
            "select name from sqlite_master where name = 'media_processing_jobs'",
          )
          .all().length === 0
      );
    } finally {
      backup.close();
    }
  });
  expect(backupNames).toHaveLength(1);
  const backupName = backupNames[0]!;
  const restoredPath = join(directory, "restored.db");
  await backupDatabase(join(directory, "backups", backupName), restoredPath);
  const restored = new SQLite(restoredPath);
  try {
    expect(
      restored.prepare("select * from item_renditions order by id").all(),
    ).toEqual(rows);
    expect(
      restored
        .prepare("select * from kysely_migration_checksums order by name")
        .all(),
    ).toEqual(history);
    expect(restored.pragma("foreign_key_check")).toEqual([]);
    expect(
      restored
        .prepare(
          "select name from sqlite_master where name = 'media_processing_jobs'",
        )
        .all(),
    ).toEqual([]);
  } finally {
    restored.close();
  }
  expect(
    (
      await sql`select * from kysely_migration_checksums where name < '0017' order by name`.execute(
        database,
      )
    ).rows,
  ).toEqual(history);
  expect(await migrateToLatest(database)).toEqual([]);
  await expect(
    migrateToLatest(database, {
      sources: {
        ...sources,
        "0017_media_processing": {
          ...sources["0017_media_processing"]!,
          checksum: "changed",
        },
      },
    }),
  ).rejects.toThrow(/checksum/i);
});

it("rolls the rendition rebuild, queue, cursor and history back together", async () => {
  const { database, sources, itemId } = await _openHistoricalCatalog();
  const schema = (
    await sql`select name, sql from sqlite_master order by name`.execute(
      database,
    )
  ).rows;
  const rows = await database
    .selectFrom("item_renditions")
    .selectAll()
    .execute();
  await expect(
    migrateToLatest(database, {
      sources: {
        ...sources,
        "0018_failure": {
          checksum: "failure",
          migration: {
            up: async () => {
              throw new Error("after processing rebuild");
            },
          },
        },
      },
    }),
  ).rejects.toThrow("after processing rebuild");
  expect(
    (
      await sql`select name, sql from sqlite_master order by name`.execute(
        database,
      )
    ).rows,
  ).toEqual(schema);
  expect(
    await database.selectFrom("item_renditions").selectAll().execute(),
  ).toEqual(rows);
  expect((await sql`pragma foreign_keys`.execute(database)).rows).toEqual([
    { foreign_keys: 1 },
  ]);
  await expect(
    insertRendition(database, { itemId, purpose: "display_small" }),
  ).rejects.toThrow(/check/i);
  expect(
    (await migrateToLatest(database)).map((result) => {
      return result.migrationName;
    }),
  ).toContain("0017_media_processing");
});

it("keeps a single discovery cursor across deletion and database reopen", async () => {
  const { database, path, itemId } = await _openHistoricalCatalog();
  await migrateToLatest(database);
  expect(
    (await sql`select * from media_processing_discovery`.execute(database))
      .rows,
  ).toEqual([
    { id: 1, cursor_item_id: null, updated_at: "1970-01-01T00:00:00.000Z" },
  ]);
  await sql`update media_processing_discovery set cursor_item_id = ${itemId}`.execute(
    database,
  );
  await sql`delete from rendition_children`.execute(database);
  await database.deleteFrom("items").where("id", "=", itemId).execute();
  const reopened = createDatabase(path);
  try {
    expect(
      (
        await sql`select cursor_item_id from media_processing_discovery`.execute(
          reopened,
        )
      ).rows,
    ).toEqual([{ cursor_item_id: itemId }]);
    await expect(
      sql`insert into media_processing_discovery values (2, null, '2026-10-14T12:00:00.000Z')`.execute(
        reopened,
      ),
    ).rejects.toThrow(/check/i);
    await expect(
      sql`insert into media_processing_discovery values (1, null, '2026-10-14T12:00:00.000Z')`.execute(
        reopened,
      ),
    ).rejects.toThrow(/unique/i);
  } finally {
    await reopened.destroy();
  }
});
