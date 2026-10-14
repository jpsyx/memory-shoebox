import { sql } from "kysely";
import { expect, it, onTestFinished } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertRendition,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("adds ordered navigation indexes without changing populated catalog rows", async () => {
  const database = createDatabase(":memory:");
  onTestFinished(() => {
    return database.destroy();
  });
  const sources = await getMigrationSourcesFromFiles();
  await migrateToLatest(database, {
    sources: Object.fromEntries(
      Object.entries(sources).filter(([name]) => {
        return name < "0016";
      }),
    ),
  });
  const uploadedBy = await insertMember(database);
  const uploadSessionId = await insertUploadSession(database, { uploadedBy });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-27",
  });
  const itemId = await insertItem(database, {
    uploadedBy,
    burst_id: burstId,
    burst_index: 1,
  });
  await insertRendition(database, { itemId });
  const snapshot = async () => {
    return Promise.all(
      [
        "items",
        "bursts",
        "item_renditions",
        "item_views",
        "outbound_emails",
      ].map((table) => {
        return sql`select * from ${sql.table(table)}`
          .execute(database)
          .then((result) => {
            return result.rows;
          });
      }),
    );
  };
  const before = await snapshot();
  const upgraded = await migrateToLatest(database);
  expect(
    upgraded.map((migration) => {
      return migration.migrationName;
    }),
  ).toContain("0016_media_navigation_indexes");
  expect(await snapshot()).toEqual(before);
  expect((await sql`pragma integrity_check`.execute(database)).rows).toEqual([
    { integrity_check: "ok" },
  ]);
  expect((await sql`pragma foreign_key_check`.execute(database)).rows).toEqual(
    [],
  );
  expect(await migrateToLatest(database)).toEqual([]);
  const altered = {
    ...sources,
    "0016_media_navigation_indexes": {
      ...sources["0016_media_navigation_indexes"]!,
      checksum: "changed",
    },
  };
  await expect(
    migrateToLatest(database, { sources: altered }),
  ).rejects.toThrow();
});
