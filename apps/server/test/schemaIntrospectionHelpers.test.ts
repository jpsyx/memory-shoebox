import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import {
  readColumns,
  readForeignKeys,
  readIndexes,
  readTableNames,
  readUniqueConstraints,
} from "../src/db/schemaIntrospectionHelpers.ts";
import type { Database } from "../src/db/types/db.types.ts";
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
  // migration explicitly created, `children_parent`. `readUniqueConstraints`
  // is the function that sees the `nickname` one, and it must still exclude
  // the primary key.
  //
  // `sibling_id` is declared as `REFERENCES parents` with no column named,
  // so SQLite reports a null `to` for it, which exercises the `?? "id"`
  // fallback in `readForeignKeys` that would otherwise go untested.
  await sql`
    CREATE TABLE children (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      nickname TEXT UNIQUE,
      sibling_id TEXT REFERENCES parents,
      visits INTEGER NOT NULL DEFAULT 0,
      mood TEXT NOT NULL DEFAULT 'sunny'
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
  it("returns each column with its nullability, declared type and default", async () => {
    expect(await readColumns(database, "children")).toEqual([
      { name: "id", isNullable: false, type: "TEXT", defaultValue: null },
      {
        name: "parent_id",
        isNullable: false,
        type: "TEXT",
        defaultValue: null,
      },
      { name: "nickname", isNullable: true, type: "TEXT", defaultValue: null },
      {
        name: "sibling_id",
        isNullable: true,
        type: "TEXT",
        defaultValue: null,
      },
      // A numeric default arrives as a string, and a string default keeps the
      // quotes SQLite stored it with.
      { name: "visits", isNullable: false, type: "INTEGER", defaultValue: "0" },
      {
        name: "mood",
        isNullable: false,
        type: "TEXT",
        defaultValue: "'sunny'",
      },
    ]);
  });

  it("reports a primary key with no NOT NULL as nullable, because SQLite does", async () => {
    await sql`CREATE TABLE loose (id TEXT PRIMARY KEY)`.execute(database);
    expect(await readColumns(database, "loose")).toEqual([
      { name: "id", isNullable: true, type: "TEXT", defaultValue: null },
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
      {
        name: "children_parent",
        columns: [{ name: "parent_id", direction: "asc" }],
        isUnique: false,
      },
    ]);
  });

  it("reports a CREATE UNIQUE INDEX as unique, and its columns in index order", async () => {
    await sql`
      CREATE UNIQUE INDEX children_parent_nickname
          ON children (parent_id, nickname)
    `.execute(database);
    expect(await readIndexes(database, "children")).toEqual([
      {
        name: "children_parent",
        columns: [{ name: "parent_id", direction: "asc" }],
        isUnique: false,
      },
      {
        name: "children_parent_nickname",
        columns: [
          { name: "parent_id", direction: "asc" },
          { name: "nickname", direction: "asc" },
        ],
        isUnique: true,
      },
    ]);
  });

  it("reports a descending column as descending, which is why it reads xinfo", async () => {
    // `pragma_index_info` has no `desc` flag, so this index and an ascending
    // one on the same column were indistinguishable until `readIndexColumns`
    // moved to `pragma_index_xinfo`. Eight indexes in the real schema are
    // descending, including the timeline's primary sort.
    await sql`
      CREATE INDEX children_nickname_desc ON children (parent_id, nickname DESC)
    `.execute(database);
    const indexes = await readIndexes(database, "children");
    const descending = indexes.find((index) => {
      return index.name === "children_nickname_desc";
    });
    expect(descending?.columns).toEqual([
      { name: "parent_id", direction: "asc" },
      { name: "nickname", direction: "desc" },
    ]);
  });

  it("drops the columns xinfo appends for a partial index's predicate", async () => {
    // `xinfo` lists the rowid, and anything the `WHERE` needs, after the
    // declared columns with `key = 0`. Without the filter this index would
    // report a `nickname` column its `CREATE INDEX` never named.
    await sql`
      CREATE INDEX children_partial ON children (parent_id)
       WHERE nickname IS NOT NULL
    `.execute(database);
    const indexes = await readIndexes(database, "children");
    const partial = indexes.find((index) => {
      return index.name === "children_partial";
    });
    expect(partial?.columns).toEqual([{ name: "parent_id", direction: "asc" }]);
  });
});

describe("readUniqueConstraints", () => {
  it("returns the column lists of table-level UNIQUE constraints", async () => {
    // `nickname TEXT UNIQUE` is declared in the `CREATE TABLE`, so it never
    // appears in `readIndexes`. This is the only place it is visible.
    expect(await readUniqueConstraints(database, "children")).toEqual([
      ["nickname"],
    ]);
  });

  it("returns a composite constraint as one list, in declaration order", async () => {
    await sql`
      CREATE TABLE pairs (
        id TEXT PRIMARY KEY NOT NULL,
        left_id TEXT NOT NULL,
        right_id TEXT NOT NULL,
        UNIQUE (left_id, right_id)
      )
    `.execute(database);
    expect(await readUniqueConstraints(database, "pairs")).toEqual([
      ["left_id", "right_id"],
    ]);
  });

  it("excludes the implicit primary key index, which every table has", async () => {
    expect(await readUniqueConstraints(database, "parents")).toEqual([]);
  });

  it("does not report an index a CREATE UNIQUE INDEX declared", async () => {
    // That one belongs to `readIndexes`, which records its name as well as
    // its columns. Reporting it here too would assert it twice.
    await sql`CREATE UNIQUE INDEX parents_name ON parents (name)`.execute(
      database,
    );
    expect(await readUniqueConstraints(database, "parents")).toEqual([]);
  });
});
