import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { readInstanceSettings } from "../../src/settings/readInstanceSettings.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers.ts";

async function _createEmptyDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

/**
 * An empty database that writes down every statement executed against it.
 *
 * Built here rather than through `createDatabase`, which takes no Kysely
 * options: `log` is the only way to count queries, and counting them is the
 * only way the one-query claim below can be checked rather than restated.
 * The migrations run first, and the log is emptied afterwards, so what is
 * counted is the read alone.
 */
async function _createCountingDatabase() {
  const executedSql: string[] = [];
  const sqlite = new SQLite(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const database = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
    log: (event) => {
      if (event.level === "query") {
        executedSql.push(event.query.sql);
      }
    },
  });
  await migrateToLatest(database);
  executedSql.length = 0;
  return { database, executedSql };
}

describe("readInstanceSettings", () => {
  it("answers from SETTING_DEFINITIONS when the instance holds no rows", async () => {
    const database = await _createEmptyDatabase();

    const settings = await readInstanceSettings({
      database,
      keys: ["shoebox.name", "shoebox.timezone", "public.base_url"],
    });

    expect(settings).toEqual({
      "shoebox.name": "My Shoebox",
      "shoebox.timezone": "UTC",
      "public.base_url": null,
    });
    await database.destroy();
  });

  it("prefers a stored override", async () => {
    const database = await _createEmptyDatabase();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "Casa Mateo",
    });

    const settings = await readInstanceSettings({
      database,
      keys: ["shoebox.name"],
    });

    expect(settings["shoebox.name"]).toBe("Casa Mateo");
    await database.destroy();
  });

  it("falls back to the default rather than throwing on a corrupt row", async () => {
    const database = await _createEmptyDatabase();
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Mars/Olympus_Mons",
    });

    const settings = await readInstanceSettings({
      database,
      keys: ["shoebox.timezone"],
    });

    expect(settings["shoebox.timezone"]).toBe("UTC");
    await database.destroy();
  });

  it("reads every requested key in one query", async () => {
    const { database, executedSql } = await _createCountingDatabase();

    const settings = await readInstanceSettings({
      database,
      keys: ["shoebox.name", "mail.from_address", "mail.from_name"],
    });

    expect(executedSql).toHaveLength(1);
    expect(Object.keys(settings)).toEqual([
      "shoebox.name",
      "mail.from_address",
      "mail.from_name",
    ]);
    await database.destroy();
  });
});
