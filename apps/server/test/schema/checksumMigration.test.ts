import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertItem,
  insertMember,
  insertUploadSession,
  NOW,
  insertComment,
  insertRendition,
  insertTag,
  insertItemTag,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("checksum migration", () => {
  it("preserves populated items including existing duplicates and adds indexed lookup", async () => {
    const database = createDatabase(":memory:");
    try {
      const sources = await getMigrationSourcesFromFiles();
      await migrateToLatest(database, {
        sources: Object.fromEntries(
          Object.entries(sources).filter(([name]) => {
            return name < "0012";
          }),
        ),
      });
      const memberId = await insertMember(database);
      const sessionId = await insertUploadSession(database, {
        uploadedBy: memberId,
      });
      await sql`INSERT INTO upload_files
        (id, upload_session_id, position, original_filename, declared_content_type, declared_bytes, state, created_at, updated_at)
        VALUES ('legacy-file', ${sessionId}, 0, 'legacy.jpg', 'image/jpeg', 1024, 'waiting', ${NOW}, ${NOW})`.execute(
        database,
      );
      const itemId = await insertItem(database, {
        uploadedBy: memberId,
        checksum: "a".repeat(64),
        seq: 1,
      });
      await insertItem(database, {
        uploadedBy: memberId,
        checksum: "a".repeat(64),
      });
      await insertItem(database, {
        uploadedBy: memberId,
        checksum: null,
        seq: 2,
      });
      await insertComment(database, { itemId, authorMemberId: memberId });
      await insertRendition(database, { itemId, purpose: "original" });
      const tagId = await insertTag(database, { name: "Keep this memory" });
      await insertItemTag(database, { itemId, tagId });
      const relatedTables = [
        "comments",
        "item_renditions",
        "tags",
        "item_tags",
        "upload_sessions",
      ] as const;
      const beforeRelated = await Promise.all(
        relatedTables.map((table) => {
          return database.selectFrom(table).selectAll().execute();
        }),
      );
      const beforeItems = await database
        .selectFrom("items")
        .selectAll()
        .execute();
      const beforeFiles = await database
        .selectFrom("upload_files")
        .selectAll()
        .execute();
      const beforeMembers = await database
        .selectFrom("members")
        .selectAll()
        .execute();
      await migrateToLatest(database);
      expect(await database.selectFrom("items").selectAll().execute()).toEqual(
        beforeItems,
      );
      expect(
        await database.selectFrom("members").selectAll().execute(),
      ).toEqual(beforeMembers);
      expect(
        await database.selectFrom("upload_files").selectAll().execute(),
      ).toEqual(
        beforeFiles.map((file) => {
          return { ...file, duplicate_reason: null, burst_excluded: 0 };
        }),
      );
      expect(
        await Promise.all(
          relatedTables.map((table) => {
            return database.selectFrom(table).selectAll().execute();
          }),
        ),
      ).toEqual(beforeRelated);
      const plan = await sql<{
        detail: string;
      }>`explain query plan select id from items where checksum = ${"a".repeat(64)}`.execute(
        database,
      );
      expect(
        plan.rows.some((row) => {
          return row.detail.includes("items_checksum");
        }),
      ).toBe(true);
      expect(
        (await sql`pragma foreign_key_check`.execute(database)).rows,
      ).toEqual([]);
      expect(await migrateToLatest(database)).toEqual([]);
    } finally {
      await database.destroy();
    }
  });
});
