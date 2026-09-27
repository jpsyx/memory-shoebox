import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import { readColumns, readTableNames } from "../src/db/introspect.ts";
import { SCHEMA_MANIFEST } from "../src/db/schemaManifest.ts";
import type { Database } from "../src/db/types.ts";
import type { Kysely } from "kysely";

let database: Kysely<Database>;

beforeEach(async () => {
  database = createDatabase(":memory:");
  await migrateToLatest(database);
});

afterEach(async () => {
  await database.destroy();
});

describe("the migrated schema", () => {
  it("contains exactly the tables the manifest declares", async () => {
    const actual = await readTableNames(database);
    const declared = Object.keys(SCHEMA_MANIFEST).sort();
    expect(actual).toEqual(declared);
  });

  it("contains exactly the columns the manifest declares, per table", async () => {
    for (const tableName of Object.keys(SCHEMA_MANIFEST)) {
      const actual = (await readColumns(database, tableName))
        .map((column) => {
          return column.name;
        })
        .sort();
      const declared = [
        ...SCHEMA_MANIFEST[tableName as keyof typeof SCHEMA_MANIFEST],
      ].sort();
      expect(actual, `columns of ${tableName}`).toEqual(declared);
    }
  });

  it("applies cleanly a second time", async () => {
    const results = await migrateToLatest(database);
    expect(results).toEqual([]);
  });
});
