import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";

/** Returns every table name present in the SQLite database. */
async function listTableNames(
  database: ReturnType<typeof createDatabase>,
): Promise<string[]> {
  const result = await sql<{ name: string }>`
    select name from sqlite_master where type = 'table'
  `.execute(database);
  return result.rows.map((row) => {
    return row.name;
  });
}

describe("migrateToLatest", () => {
  it("brings a fresh in-memory database up to date", async () => {
    const database = createDatabase(":memory:");

    const results = await migrateToLatest(database);

    expect(
      results.every((result) => {
        return result.status === "Success";
      }),
    ).toBe(true);
    // The migrator records applied migrations in its own bookkeeping table,
    // so its presence proves the migrator ran rather than silently no-opped.
    expect(await listTableNames(database)).toContain("kysely_migration");
    await database.destroy();
  });

  it("is idempotent when run twice", async () => {
    const database = createDatabase(":memory:");

    await migrateToLatest(database);
    const secondRun = await migrateToLatest(database);

    expect(secondRun).toEqual([]);
    await database.destroy();
  });
});
