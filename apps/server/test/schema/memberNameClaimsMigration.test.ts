import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { insertMember } from "../helpers/seedHelpers/memberSeedHelpers.ts";

async function legacyCatalog() {
  const database = createDatabase(":memory:");
  const sources = await getMigrationSourcesFromFiles();
  await migrateToLatest(database, {
    sources: Object.fromEntries(
      Object.entries(sources).filter(([name]) => {
        return name < "0019";
      }),
    ),
  });
  return database;
}

describe("permanent member name migration", () => {
  it("adds profile state and claims to an empty historical catalog", async () => {
    const database = await legacyCatalog();
    try {
      await migrateToLatest(database);
      const columns = await sql<{
        name: string;
      }>`pragma table_info(members)`.execute(database);
      expect(
        columns.rows.map((column) => {
          return column.name;
        }),
      ).toContain("profile_completed_at");
      expect(
        await database.selectFrom("member_name_claims").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await database.destroy();
    }
  });

  it("preserves unique legacy fallback, accents, removed and invited names", async () => {
    const database = await legacyCatalog();
    try {
      const active = await insertMember(database, {
        display_name: null,
        email: "rosa@example.com",
      });
      const removed = await insertMember(database, {
        display_name: "Sofía",
        status: "removed",
      });
      const invited = await insertMember(database, {
        display_name: "John M",
        status: "invited",
        joined_at: null,
        last_signed_in_at: null,
      });
      await migrateToLatest(database);
      const rows = await database
        .selectFrom("members")
        .selectAll()
        .orderBy("display_name")
        .execute();
      expect(
        rows.find((row) => {
          return row.id === active;
        }),
      ).toMatchObject({
        display_name: "rosa",
        profile_completed_at: expect.any(String),
      });
      expect(
        rows.find((row) => {
          return row.id === removed;
        }),
      ).toMatchObject({
        display_name: "Sofía",
        profile_completed_at: expect.any(String),
      });
      expect(
        rows.find((row) => {
          return row.id === invited;
        }),
      ).toMatchObject({
        display_name: "John M",
        profile_completed_at: null,
        suggested_display_name: "John M",
      });
      expect(
        await database.selectFrom("member_name_claims").selectAll().execute(),
      ).toHaveLength(3);
    } finally {
      await database.destroy();
    }
  });

  it("rolls back schema, members, people and history on unresolved collisions", async () => {
    const database = await legacyCatalog();
    try {
      await insertMember(database, { display_name: "John" });
      await insertMember(database, { display_name: " JOHN " });
      const before =
        await sql`select * from sqlite_master order by name`.execute(database);
      const members = await database
        .selectFrom("members")
        .selectAll()
        .execute();
      const history = await sql`select * from kysely_migration`.execute(
        database,
      );
      await expect(migrateToLatest(database)).rejects.toThrow(
        /assignment|collision/i,
      );
      expect(
        (await sql`select * from sqlite_master order by name`.execute(database))
          .rows,
      ).toEqual(before.rows);
      expect(
        await database.selectFrom("members").selectAll().execute(),
      ).toEqual(members);
      expect(
        (await sql`select * from kysely_migration`.execute(database)).rows,
      ).toEqual(history.rows);
    } finally {
      await database.destroy();
    }
  });
});
