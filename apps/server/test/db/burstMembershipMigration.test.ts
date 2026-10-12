import { sql } from "kysely";
import { expect, it, onTestFinished } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("backfills original memberships without changing existing photos or groups", async () => {
  const database = createDatabase(":memory:");
  onTestFinished(() => {
    return database.destroy();
  });
  const sources = await getMigrationSourcesFromFiles();
  await migrateToLatest(database, {
    sources: Object.fromEntries(
      Object.entries(sources).filter(([name]) => {
        return name < "0014";
      }),
    ),
  });
  const uploadedBy = await insertMember(database);
  const uploadSessionId = await insertUploadSession(database, { uploadedBy });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-14",
  });
  const itemId = await insertItem(database, {
    uploadedBy,
    burst_id: burstId,
    burst_index: 7,
  });
  const itemBefore = await database
    .selectFrom("items")
    .selectAll()
    .executeTakeFirstOrThrow();
  const burstBefore = await database
    .selectFrom("bursts")
    .selectAll()
    .executeTakeFirstOrThrow();
  await migrateToLatest(database);
  const { id, ...burstMetadata } = burstBefore;
  expect(
    await database.selectFrom("item_burst_history").selectAll().execute(),
  ).toEqual([
    { item_id: itemId, burst_id: id, burst_index: 7, ...burstMetadata },
  ]);
  expect(
    await database.selectFrom("items").selectAll().executeTakeFirstOrThrow(),
  ).toEqual({ ...itemBefore, visual_fingerprint: null });
  expect(
    await database.selectFrom("bursts").selectAll().executeTakeFirstOrThrow(),
  ).toEqual(burstBefore);
  await database
    .updateTable("items")
    .set({ burst_id: null, burst_index: null })
    .where("id", "=", itemId)
    .execute();
  await database.deleteFrom("bursts").where("id", "=", burstId).execute();
  expect(
    await database.selectFrom("item_burst_history").selectAll().execute(),
  ).toHaveLength(1);
  await database.deleteFrom("items").where("id", "=", itemId).execute();
  expect(
    await database.selectFrom("item_burst_history").selectAll().execute(),
  ).toEqual([]);
  expect((await sql`pragma foreign_key_check`.execute(database)).rows).toEqual(
    [],
  );
});
