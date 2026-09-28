import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  readColumns,
  readTableNames,
} from "../../src/db/schemaIntrospectionHelpers.ts";
import { SCHEMA_MANIFEST } from "../../src/db/schemaManifest/schemaManifest.ts";
import { TABLE_NAMES } from "./schema.constants.ts";
import type { Database } from "../../src/db/types/db.types.ts";
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

  it("matches the manifest column for column, including nullability, type and default", async () => {
    for (const tableName of TABLE_NAMES) {
      const actual = Object.fromEntries(
        (await readColumns({ database, tableName })).map((column) => {
          return [
            column.name,
            {
              isNullable: column.isNullable,
              type: column.type,
              defaultValue: column.defaultValue,
            },
          ];
        }),
      );
      expect(actual, `columns of ${tableName}`).toEqual(
        SCHEMA_MANIFEST[tableName],
      );
    }
  });

  it("applies cleanly a second time", async () => {
    const results = await migrateToLatest(database);
    expect(results).toEqual([]);
  });
});
