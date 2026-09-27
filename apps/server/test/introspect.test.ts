import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import {
  readColumns,
  readForeignKeys,
  readIndexes,
  readTableNames,
} from "../src/db/introspect.ts";
import type { Database } from "../src/db/types.ts";
import type { Kysely } from "kysely";

let database: Kysely<Database>;

beforeEach(async () => {
  database = createDatabase(":memory:");
  await sql`
    CREATE TABLE parents (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    )
  `.execute(database);
  // `nickname` is UNIQUE so the fixture also declares an implicit index
  // (alongside the implicit primary key index every table already gets).
  // `readIndexes` must exclude both: it should return only the index the
  // migration explicitly created, `children_parent`.
  //
  // `sibling_id` is declared as `REFERENCES parents` with no column named,
  // so SQLite reports a null `to` for it, which exercises the `?? "id"`
  // fallback in `readForeignKeys` that would otherwise go untested.
  await sql`
    CREATE TABLE children (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      nickname TEXT UNIQUE,
      sibling_id TEXT REFERENCES parents
    )
  `.execute(database);
  await sql`CREATE INDEX children_parent ON children (parent_id)`.execute(
    database,
  );
});

afterEach(async () => {
  await database.destroy();
});

describe("readTableNames", () => {
  it("lists user tables and ignores sqlite internals", async () => {
    expect(await readTableNames(database)).toEqual(["children", "parents"]);
  });

  it("excludes Kysely's migration bookkeeping tables", async () => {
    await sql`CREATE TABLE kysely_migration (name TEXT)`.execute(database);
    expect(await readTableNames(database)).not.toContain("kysely_migration");
  });
});

describe("readColumns", () => {
  it("returns each column with its nullability", async () => {
    expect(await readColumns(database, "children")).toEqual([
      { name: "id", isNullable: false },
      { name: "parent_id", isNullable: false },
      { name: "nickname", isNullable: true },
      { name: "sibling_id", isNullable: true },
    ]);
  });

  it("reports a primary key with no NOT NULL as nullable, because SQLite does", async () => {
    await sql`CREATE TABLE loose (id TEXT PRIMARY KEY)`.execute(database);
    expect(await readColumns(database, "loose")).toEqual([
      { name: "id", isNullable: true },
    ]);
  });
});

describe("readForeignKeys", () => {
  it("returns the referenced table and the delete rule", async () => {
    expect(await readForeignKeys(database, "children")).toEqual([
      {
        column: "parent_id",
        referencesTable: "parents",
        referencesColumn: "id",
        onDelete: "CASCADE",
      },
      {
        // Declared as `REFERENCES parents` with no column, so SQLite reports
        // a null `to` and the helper resolves it to the primary key.
        column: "sibling_id",
        referencesTable: "parents",
        referencesColumn: "id",
        onDelete: "NO ACTION",
      },
    ]);
  });
});

describe("readIndexes", () => {
  it("returns indexes this schema declared, not implicit ones", async () => {
    expect(await readIndexes(database, "children")).toEqual([
      { name: "children_parent", columns: ["parent_id"], isUnique: false },
    ]);
  });
});
