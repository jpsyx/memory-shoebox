import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SQLite from "better-sqlite3";
import { backupDatabase } from "../../src/db/backupDatabase.ts";
import { sql } from "kysely";
import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import {
  insertMember,
  insertItem,
  insertRemovalRequest,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("preserves populated 0009 rebuild rows, indexes, and child references", async () => {
  const directory = mkdtempSync(join(tmpdir(), "populated-upgrade-"));
  const database = createDatabase(join(directory, "catalog.db"));
  try {
    const sources = await getMigrationSourcesFromFiles();
    await migrateToLatest(database, {
      sources: Object.fromEntries(
        Object.entries(sources).filter(([name]) => {
          return name < "0009";
        }),
      ),
    });
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const requestId = await insertRemovalRequest(database, {
      requestedByMemberId: memberId,
      itemUploaderMemberId: memberId,
      item_id: itemId,
      state: "open",
      resolved_at: null,
    });
    await insertRemovalRequest(database, {
      requestedByMemberId: memberId,
      itemUploaderMemberId: memberId,
    });
    await sql`create table request_children (request_id text references removal_requests(id) on delete cascade)`.execute(
      database,
    );
    await sql`insert into request_children values (${requestId})`.execute(
      database,
    );
    const requests = await database
      .selectFrom("removal_requests")
      .selectAll()
      .orderBy("id")
      .execute();
    const indexes = (
      await sql`select name, sql from sqlite_master where type = 'index' and tbl_name = 'removal_requests' order by name`.execute(
        database,
      )
    ).rows;
    const existingBackups = readdirSync(join(directory, "backups"));
    await migrateToLatest(database);
    const backupName = readdirSync(join(directory, "backups")).find((name) => {
      return !existingBackups.includes(name);
    })!;
    const restoredPath = join(directory, "restored.db");
    await backupDatabase(join(directory, "backups", backupName), restoredPath);
    const restored = new SQLite(restoredPath);
    try {
      expect(
        restored.prepare("select * from removal_requests order by id").all(),
      ).toEqual(requests);
      expect(restored.prepare("select * from request_children").all()).toEqual([
        { request_id: requestId },
      ]);
      expect(
        restored
          .prepare("select count(*) as count from kysely_migration")
          .get(),
      ).toEqual({ count: 8 });
    } finally {
      restored.close();
    }
    expect(
      await database
        .selectFrom("removal_requests")
        .selectAll()
        .orderBy("id")
        .execute(),
    ).toEqual(requests);
    expect(
      (await sql`select * from request_children`.execute(database)).rows,
    ).toEqual([{ request_id: requestId }]);
    expect(
      (
        await sql`select name, sql from sqlite_master where type = 'index' and tbl_name = 'removal_requests' order by name`.execute(
          database,
        )
      ).rows,
    ).toEqual(indexes);
    expect(
      (await sql`pragma foreign_key_check`.execute(database)).rows,
    ).toEqual([]);
    await expect(
      database
        .updateTable("removal_requests")
        .set({ item_id: null })
        .where("id", "=", requestId)
        .execute(),
    ).rejects.toThrow(/check/i);
  } finally {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
});
