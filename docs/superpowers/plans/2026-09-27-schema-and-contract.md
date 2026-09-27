# Schema and Shared Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all thirty-three tables of the Memory Shoebox schema as seven migrations, the Kysely types over them, and the part of the HTTP contract that more than one route slice needs.

**Architecture:** Seven migrations grouped as `data-models.md` is sectioned, applied by the explicit registry that already exists. `types.ts` stays hand-written and a manifest links it to the live database, so a table or column that drifts fails at compile time or in a test rather than at runtime. `packages/shared` splits from one file into five modules re-exported by a barrel.

**Tech Stack:** SQLite via better-sqlite3, Kysely 0.28, Zod 4, Vitest 4, TypeScript 6. Node runs the server's TypeScript directly, so every relative import under `apps/server/**` carries a `.ts` extension.

---

## A correction made during execution

The code blocks below originally declared shapes with `interface`.
`docs/rules/typescript.md:70` requires `type` instead, reserving `interface`
for OOP-style interfaces implemented by a class, and none of these are. Every
block has been corrected. If you are reading a task and find an `interface`
that is not implemented by a class, it is a mistake in this plan and the rule
wins.

## How this plan handles the schema itself

**The column lists are not reproduced here, deliberately.**
`docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md` already
specifies every column, type, nullability, default, `CHECK`, foreign key and
index, in tables, with the reasoning attached. Copying 1,500 lines of that into
this plan would create two copies of a schema and one of them would be the
stale one, which is the exact failure the repository's own documentation rules
warn about.

So each migration task **names its section and its tables, writes out the traps
in full, and shows one complete worked table as the pattern.** The executing
agent reads the cited section for the column lists. That is a citation to a
normative document, not a placeholder: the information exists, it is precise,
and it is one file away.

Every other kind of code in this plan (tests, types, the manifest, the shared
package) is written out in full.

## Before you start

Read, in this order:

1. `docs/superpowers/specs/2026-09-27-schema-and-contract-design.md`, the design this implements
2. `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md` § Every table, for what exists and what deliberately does not
3. `AGENTS.md` § Implementation approaches, for the red/green rule, and § General Code Style
4. `docs/rules/sql.md` and `docs/rules/typescript.md`, both binding

Four tables are defined in prose rather than under a heading and are easy to
miss: `visibility_rules`, `visibility_rule_subjects`, `email_delivery_events`
and `email_suppressions`. The inventory at the head of `data-models.md` lists
them.

## File structure

| File                                                           | Responsibility                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/server/src/db/migrations/0001_identity_and_access.ts`    | `members`, `sign_in_codes`, `sessions`, `invitations`, `groups`, `group_members`                                                                 |
| `apps/server/src/db/migrations/0002_visibility.ts`             | `visibility_rules`, `visibility_rule_subjects`                                                                                                   |
| `apps/server/src/db/migrations/0003_archive.ts`                | `items`, `item_renditions`, `bursts`, `milestones`, `item_milestones`, `item_capture_date_changes`, `tags`, `item_tags`, `people`, `item_people` |
| `apps/server/src/db/migrations/0004_comments_and_reactions.ts` | `comments`, `item_reactions`, `comment_reactions`                                                                                                |
| `apps/server/src/db/migrations/0005_moderation.ts`             | `removal_requests`                                                                                                                               |
| `apps/server/src/db/migrations/0006_upload.ts`                 | `upload_sessions`, `upload_files`, `upload_batch_edits`, `upload_batch_edit_targets`, `pending_object_deletions`                                 |
| `apps/server/src/db/migrations/0007_operations_and_audit.ts`   | `settings`, `outbound_emails`, `email_delivery_events`, `email_suppressions`, `item_views`, `activity_events`                                    |
| `apps/server/src/db/migrations/migrations.ts`                  | Registry. Gains seven entries                                                                                                                    |
| `apps/server/src/db/types.ts`                                  | The `Database` interface, one entry per table                                                                                                    |
| `apps/server/src/db/schemaManifest.ts`                         | The runtime table and column manifest, tied to `Database` at compile time                                                                        |
| `apps/server/src/db/introspect.ts`                             | Reads tables, columns, foreign keys and indexes out of a live database                                                                           |
| `apps/server/test/schema.test.ts`                              | Drift, relationships, indexes, idempotency                                                                                                       |
| `packages/shared/src/index.ts`                                 | Barrel. Re-exports only                                                                                                                          |
| `packages/shared/src/health.ts`                                | The existing health schemas, moved                                                                                                               |
| `packages/shared/src/errors.ts`                                | `apiErrorSchema` with `details`                                                                                                                  |
| `packages/shared/src/limits.ts`                                | String caps and per-item limits                                                                                                                  |
| `packages/shared/src/dtos.ts`                                  | The twelve frozen DTOs                                                                                                                           |
| `packages/shared/src/settings.ts`                              | `SETTING_DEFINITIONS`                                                                                                                            |
| `packages/shared/test/settings.test.ts`                        | Defaults resolve with zero rows                                                                                                                  |

---

## Task 1: Add the uuidv7 dependency

**Files:**

- Modify: `apps/server/package.json`
- Test: `apps/server/test/ids.test.ts` (create)
- Create: `apps/server/src/db/ids.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createId } from "../src/db/ids.ts";

describe("createId", () => {
  it("returns a v7 uuid", () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("sorts lexicographically in creation order, including within one millisecond", () => {
    const ids = Array.from({ length: 10_000 }, () => {
      return createId();
    });
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("never repeats an id", () => {
    const ids = Array.from({ length: 10_000 }, () => {
      return createId();
    });
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

The second test is the one that matters. It is why this is a dependency rather
than twenty-five hand-written lines: ten thousand ids mint inside a handful of
milliseconds, so almost every pair shares a timestamp and only the monotonic
counter keeps them ordered.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test ids`
Expected: FAIL, `Cannot find module '../src/db/ids.ts'`

- [ ] **Step 3: Add the dependency**

Run: `pnpm --filter @memory-shoebox/server add uuidv7`

Expected: `package.json` gains `"uuidv7": "^1.2.1"` under `dependencies`, and
`pnpm-lock.yaml` changes. It has no transitive dependencies.

- [ ] **Step 4: Write minimal implementation**

Create `apps/server/src/db/ids.ts`:

```ts
import { uuidv7 } from "uuidv7";

/**
 * Mints a primary key.
 *
 * UUIDv7 rather than v4, and the difference is load-bearing rather than
 * cosmetic: the first 48 bits are a Unix millisecond timestamp, so ids sort by
 * creation time, inserts land at the end of the index instead of scattering
 * across it, and a cursor needs no second column to break ties. The timeline,
 * the activity feed and the upload file list all page on that property.
 *
 * The library is here for the sub-millisecond counter. Several thousand rows
 * can be written inside one millisecond during an upload commit, and without a
 * counter their order would be random within that millisecond, which is a
 * cursor that silently skips rows.
 */
export function createId(): string {
  return uuidv7();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test ids`
Expected: PASS, 3 tests

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/src/db/ids.ts apps/server/test/ids.test.ts pnpm-lock.yaml
git commit -m "feat: mint uuidv7 primary keys"
```

---

## Task 2: Introspection helpers

**Files:**

- Create: `apps/server/src/db/introspect.ts`
- Test: `apps/server/test/introspect.test.ts`

These read what a live database actually contains. Every schema assertion in
this plan goes through them, because a migration that silently did not apply
looks identical in source to one that did.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/introspect.test.ts`:

```ts
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
  await sql`
    CREATE TABLE children (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      nickname TEXT,
      -- A second table referenced without naming its column, so the null-`to`
      -- fallback is exercised rather than assumed.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test introspect`
Expected: FAIL, `Cannot find module '../src/db/introspect.ts'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/db/introspect.ts`:

```ts
import { sql, type Kysely } from "kysely";
import type { Database } from "./types.ts";

/** One column as SQLite reports it. */
export type ColumnInfo = {
  readonly name: string;
  readonly isNullable: boolean;
};

/** One foreign key as SQLite reports it. */
export type ForeignKeyInfo = {
  readonly column: string;
  readonly referencesTable: string;
  readonly referencesColumn: string;
  /** `CASCADE`, `SET NULL`, `RESTRICT` or `NO ACTION`. */
  readonly onDelete: string;
};

/** One index this schema declared. */
export type IndexInfo = {
  readonly name: string;
  readonly columns: readonly string[];
  readonly isUnique: boolean;
};

type TableNameRow = {
  readonly name: string;
};

type TableInfoRow = {
  readonly name: string;
  readonly notnull: number;
};

type ForeignKeyRow = {
  readonly from: string;
  readonly table: string;
  readonly to: string | null;
  readonly on_delete: string;
};

type IndexListRow = {
  readonly name: string;
  readonly unique: number;
  readonly origin: string;
};

type IndexInfoRow = {
  readonly name: string | null;
  readonly seqno: number;
};

/**
 * Every user table, sorted.
 *
 * Excludes `sqlite_%`, which covers the autoindex and sequence tables SQLite
 * maintains, and `kysely_migration%`, which is bookkeeping rather than schema.
 */
export async function readTableNames(
  database: Kysely<Database>,
): Promise<string[]> {
  const result = await sql<TableNameRow>`
    SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE 'kysely_migration%'
     ORDER BY name
  `.execute(database);
  return result.rows.map((row) => {
    return row.name;
  });
}

/**
 * Every column of one table, in declaration order, reporting what the database
 * actually enforces.
 *
 * **`pk` is deliberately not consulted.** SQLite permits a null in a
 * non-INTEGER primary key, so a column declared `id TEXT PRIMARY KEY` without
 * `NOT NULL` really does accept a null id. An earlier draft treated any
 * primary key as not-nullable, which made this function unable to see exactly
 * that mistake on any of the thirty-three `id` columns the migrations write.
 * The whole point of reading the live database is to catch what the migration
 * source hides, so report `notnull` and nothing else.
 *
 * Two limitations, deliberate and recorded so they read as choices:
 *
 * - A **composite** foreign key is returned by `pragma_foreign_key_list` as
 *   one row per column sharing an `id`. `readForeignKeys` drops `id` and
 *   `seq`, so it would present a composite key as several single-column keys.
 *   This schema has none, and the assertion table in Task 11 would not fit one
 *   either.
 * - A **partial** index (`... WHERE state = 'open'`) is indistinguishable here
 *   from a full index on the same column, because the predicate lives in
 *   `sqlite_master.sql` rather than in `pragma_index_info`. This schema has
 *   several, so Task 11 asserts their predicates separately.
 */
export async function readColumns(
  database: Kysely<Database>,
  tableName: string,
): Promise<ColumnInfo[]> {
  const result = await sql<TableInfoRow>`
    SELECT name, "notnull" FROM pragma_table_info(${tableName})
  `.execute(database);
  return result.rows.map((row) => {
    return { name: row.name, isNullable: row.notnull === 0 };
  });
}

/** Every foreign key of one table, with the delete rule that governs it. */
export async function readForeignKeys(
  database: Kysely<Database>,
  tableName: string,
): Promise<ForeignKeyInfo[]> {
  const result = await sql<ForeignKeyRow>`
    SELECT "from", "table", "to", on_delete
      FROM pragma_foreign_key_list(${tableName})
     ORDER BY "from"
  `.execute(database);
  return result.rows.map((row) => {
    return {
      column: row.from,
      referencesTable: row.table,
      // Null means the key points at the target's primary key.
      referencesColumn: row.to ?? "id",
      onDelete: row.on_delete,
    };
  });
}

/**
 * Every index this schema declared on one table.
 *
 * Filters to `origin = 'c'`, which is "created by CREATE INDEX". The other
 * origins are the implicit indexes SQLite builds for `UNIQUE` and primary key
 * constraints, which are a consequence of the table definition rather than
 * something a migration asked for.
 */
export async function readIndexes(
  database: Kysely<Database>,
  tableName: string,
): Promise<IndexInfo[]> {
  const list = await sql<IndexListRow>`
    SELECT name, "unique", origin FROM pragma_index_list(${tableName})
     ORDER BY name
  `.execute(database);

  const declared = list.rows.filter((row) => {
    return row.origin === "c";
  });

  return Promise.all(
    declared.map(async (row) => {
      const info = await sql<IndexInfoRow>`
        SELECT name, seqno FROM pragma_index_info(${row.name}) ORDER BY seqno
      `.execute(database);
      return {
        name: row.name,
        columns: info.rows
          .map((column) => {
            return column.name;
          })
          .filter((name): name is string => {
            return name !== null;
          }),
        isUnique: row.unique === 1,
      };
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test introspect`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/introspect.ts apps/server/test/introspect.test.ts
git commit -m "feat: read tables, columns, foreign keys and indexes from a live database"
```

---

## Task 3: The schema manifest and the drift test

**Files:**

- Create: `apps/server/src/db/schemaManifest.ts`
- Create: `apps/server/test/schema.test.ts`

TypeScript types are erased at runtime, so a test cannot read `Database`
directly. A manifest carries the same information at runtime, and a
compile-time assertion keeps the two identical. Adding a table to one and not
the other fails `pnpm type-check`.

This task builds the harness against the empty schema. Tasks 4 to 10 each add
a group of tables and turn it red, then green.

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/schema.test.ts`:

```ts
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

  it("matches the manifest column for column, including nullability", async () => {
    for (const tableName of Object.keys(SCHEMA_MANIFEST)) {
      const actual = Object.fromEntries(
        (await readColumns(database, tableName)).map((column) => {
          return [column.name, column.isNullable];
        }),
      );
      const declared =
        SCHEMA_MANIFEST[tableName as keyof typeof SCHEMA_MANIFEST];
      expect(actual, `columns of ${tableName}`).toEqual(declared);
    }
  });

  it("applies cleanly a second time", async () => {
    const results = await migrateToLatest(database);
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test schema`
Expected: FAIL, `Cannot find module '../src/db/schemaManifest.ts'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/server/src/db/schemaManifest.ts`:

```ts
import type { Database } from "./types.ts";

/**
 * Every table, every column, and whether the column is nullable, at runtime.
 *
 * `Database` in `types.ts` is the same information as a type, and types are
 * erased before any test can read them. This is the runtime copy. The shape
 * below ties the two together at compile time and the schema test ties this
 * to the database the migrations actually built, so all three have to agree.
 *
 * `false` means the column is `NOT NULL`. Keep the columns in the order
 * `data-models.md` gives them; the test compares maps, so the order is for
 * the reader.
 */
export const SCHEMA_MANIFEST = {} as const satisfies SchemaManifestShape;

/**
 * Every table in `Database`, mapping every one of its columns to whether the
 * Kysely type makes it nullable.
 *
 * This single mapped type does all the checking, and it is worth understanding
 * why before changing it. Because it is a **full** mapped type rather than a
 * partial one, `satisfies` rejects three different mistakes on its own:
 *
 * | Mistake                                  | What the compiler says              |
 * | ---------------------------------------- | ----------------------------------- |
 * | A table left out of the manifest         | `TS1360`, naming the table          |
 * | A column left out of a table's entry     | `TS2741`, naming the column         |
 * | Nullability disagreeing with `Database`  | `TS2322: 'false' is not assignable to type 'true'` |
 *
 * An earlier draft listed columns as a string array and needed two hand-built
 * `Exclude` guards to catch the second case, because an array cannot express
 * completeness. Those guards then had to be referenced to survive
 * `noUnusedLocals`, and deleting a guard and its reference together removed
 * the check silently. Mapping the columns as object keys makes all of that
 * unnecessary: there is nothing to leave unused and nothing to delete.
 */
type SchemaManifestShape = {
  readonly [TableName in keyof Database]: {
    readonly [ColumnName in keyof Database[TableName] &
      string]: null extends Database[TableName][ColumnName] ? true : false;
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test schema`
Expected: PASS, 3 tests. The first two pass vacuously: no tables declared, no
tables built. Tasks 4 to 10 give them something to compare.

- [ ] **Step 5: Verify the guard actually catches drift. This step is the point of the task.**

A harness that passes vacuously and would also pass when broken has not been
built. Prove each of these, and record the compiler output you actually saw.

Temporarily add a table to `Database` in `types.ts`:

```ts
export type Database = {
  bogus: { id: string; note: string | null };
};
```

| Do this                                                                           | Expect                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Leave the manifest `{}` and run `pnpm --filter @memory-shoebox/server type-check` | FAIL, `TS1360`, naming `bogus`                                                                          |
| Set the manifest to `bogus: { id: false }`                                        | FAIL, `TS2741`, naming the missing `note`                                                               |
| Set it to `bogus: { id: false, note: false }`                                     | FAIL, `TS2322`, `'false' is not assignable to type 'true'`, because `Database` types `note` as nullable |
| Set it to `bogus: { id: false, note: true }`                                      | PASS                                                                                                    |
| Now run `pnpm --filter @memory-shoebox/server test schema`                        | FAIL, because no migration builds `bogus`                                                               |

**Revert every one of these edits before continuing**, and confirm with
`git status` that `types.ts` is unmodified.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/schemaManifest.ts apps/server/test/schema.test.ts
git commit -m "test: assert the live schema matches the declared one"
```

---

## Tasks 4 to 10: the seven migrations

Every one of these seven tasks has the identical shape, so the loop is written
once here and each task below gives only what differs: its section, its tables,
and its traps.

**The loop, per migration:**

1. Add the group's tables to `Database` in `types.ts` and to `SCHEMA_MANIFEST`
2. Run `pnpm --filter @memory-shoebox/server test schema`. Expected: FAIL, the
   tables are declared and not built. **This is the red step.**
3. Write the migration
4. Register it in `migrations.ts`
5. Run the schema test again. Expected: PASS
6. Run `pnpm --filter @memory-shoebox/server type-check`. Expected: PASS
7. Commit

**The pattern, written out once.** Here is `members` in full, from
`data-models.md` § `members`. Every other table follows the same shape:

```ts
import { sql, type Kysely } from "kysely";

export const up = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema
    .createTable("members")
    .addColumn("id", "text", (column) => {
      return column.primaryKey().notNull();
    })
    .addColumn("email", "text", (column) => {
      return column.notNull().unique();
    })
    .addColumn("display_name", "text")
    .addColumn("role", "text", (column) => {
      return column
        .notNull()
        .defaultTo("viewer")
        .check(sql`role IN ('viewer', 'uploader', 'admin')`);
    })
    .addColumn("status", "text", (column) => {
      return column
        .notNull()
        .defaultTo("invited")
        .check(sql`status IN ('invited', 'active', 'removed')`);
    })
    .addColumn("notify_on_upload", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_upload IN (0, 1)`);
    })
    .addColumn("notify_on_comment", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_comment IN (0, 1)`);
    })
    .addColumn("notify_on_reply", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_reply IN (0, 1)`);
    })
    .addColumn("notify_on_removal", "integer", (column) => {
      return column
        .notNull()
        .defaultTo(1)
        .check(sql`notify_on_removal IN (0, 1)`);
    })
    .addColumn("joined_at", "text")
    .addColumn("last_signed_in_at", "text")
    .addColumn("last_seen_at", "text")
    .addColumn("removed_at", "text")
    .addColumn("created_at", "text", (column) => {
      return column.notNull();
    })
    .execute();
};

export const down = async (database: Kysely<unknown>): Promise<void> => {
  await database.schema.dropTable("members").execute();
};
```

And its `types.ts` entry:

```ts
/** One invited address, for the life of the Shoebox. Never hard-deleted. */
export type MembersTable = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  notify_on_upload: number;
  notify_on_comment: number;
  notify_on_reply: number;
  notify_on_removal: number;
  joined_at: string | null;
  last_signed_in_at: string | null;
  last_seen_at: string | null;
  removed_at: string | null;
  created_at: string;
};
```

And its manifest entry. **`false` means `NOT NULL`**, and it has to agree with
both the `MembersTable` type above and the migration below, or the build fails:

```ts
members: {
  id: false,
  email: false,
  display_name: true,
  role: false,
  status: false,
  notify_on_upload: false,
  notify_on_comment: false,
  notify_on_reply: false,
  notify_on_removal: false,
  joined_at: true,
  last_signed_in_at: true,
  last_seen_at: true,
  removed_at: true,
  created_at: false,
},
```

**Every `id` column takes `.primaryKey().notNull()`, both parts.** SQLite
permits a null in a non-INTEGER primary key, so `.primaryKey()` alone leaves a
column that really does accept a null id. The manifest says `id: false`, the
schema test reads what the database enforces, and the two disagreeing is how
you will find out if you forget.

**Three rules that apply to every migration:**

- **Booleans are `INTEGER NOT NULL CHECK (x IN (0,1))`.** SQLite has no boolean
  type and the check is what keeps the column honest.
- **Timestamps and calendar dates are `TEXT`.** ISO-8601 UTC with milliseconds
  for the first, `YYYY-MM-DD` for the second, because both then compare and
  sort as text.
- **Enums are `TEXT` with a `CHECK`.** No lookup tables. The constraint is the
  documentation.

---

### Task 4: Migration 0001, identity and access

**Files:**

- Create: `apps/server/src/db/migrations/0001_identity_and_access.ts`
- Modify: `apps/server/src/db/migrations/migrations.ts`
- Modify: `apps/server/src/db/types.ts`
- Modify: `apps/server/src/db/schemaManifest.ts`

**Section:** `data-models.md` § Identity and access
**Tables:** `members`, `sign_in_codes`, `sessions`, `invitations`, `groups`,
`group_members`

**Traps in this group:**

- **`members` is never hard-deleted.** Removal is a `status` change, and every
  **authorship** key elsewhere hangs off this id, which is why those keys are
  `RESTRICT` and the restriction never actually fires. "Their name stays on
  it" is the promise that pays for.

  **This does not make every key to `members` a `RESTRICT`, and an earlier
  draft of this plan wrongly said it did.** The **credential** tables in this
  group cascade, deliberately and for security:
  `sign_in_codes.member_id`, `sessions.member_id` and `invitations.member_id`
  are all `CASCADE`, because, in the document's own words, "a live code
  outliving its member is an authentication bypass" and a session row exists
  so "shell surgery cannot leave a live credential belonging to nobody".

  The split is authorship versus credentials, not one rule. Take every cascade
  from `data-models.md` column by column rather than from a generalisation,
  including this one.

- **`members.email` is `UNIQUE` globally**, including removed members, because
  re-inviting an address reuses the row.
- **`sign_in_codes` stores `HMAC-SHA256(digits, pepper)`**, not the digits and
  not a bare digest. The column holds the HMAC; the pepper is configuration and
  is not in this schema.
- **`groups` takes `name_normalized`** with `UNIQUE (name_normalized)`, not
  `UNIQUE (name)`. Trimmed, lowercased, whitespace-collapsed, NFC, the same
  normalisation `tags` uses.
- **`group_members` needs `INDEX (member_id, group_id)`**, which
  `data-models.md` calls the second-hottest index in the product. The unique
  constraint on `(group_id, member_id)` cannot serve it, because `member_id` is
  not its leading column.

- [ ] **Step 1: Declare the six tables** in `types.ts` and `schemaManifest.ts`, per § Identity and access
- [ ] **Step 2: Run `pnpm --filter @memory-shoebox/server test schema`.** Expected: FAIL, six tables declared and none built
- [ ] **Step 3: Write `0001_identity_and_access.ts`** following the worked pattern above
- [ ] **Step 4: Register it** in `migrations.ts` as `"0001_identity_and_access": migration0001IdentityAndAccess`
- [ ] **Step 5: Run the schema test.** Expected: PASS
- [ ] **Step 6: Run `pnpm --filter @memory-shoebox/server type-check`.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the identity and access tables"
```

---

### Task 5: Migration 0002, visibility

**Files:**

- Create: `apps/server/src/db/migrations/0002_visibility.ts`
- Modify: `migrations.ts`, `types.ts`, `schemaManifest.ts`

**Section:** `data-models.md` § Visibility tables. **Both tables are defined in
prose there, not under headings.**
**Tables:** `visibility_rules`, `visibility_rule_subjects`

**Traps in this group:**

- **`visibility_rules` indexes `(mode, subject_digest)` and it is NOT unique.**
  Rules are deduplicated by the application at resolve time, not by a
  constraint.
- **`visibility_rule_subjects.group_id` is `RESTRICT`, not `CASCADE`**, while
  `member_id` beside it is `CASCADE`. This is deliberate and it is a security
  boundary: cascading a group deletion would silently widen access on every
  rule that excluded that group. `data-models.md` § Deleting a group is a
  security boundary argues it.
- **A `CHECK` that exactly one of `member_id` and `group_id` is set**, and that
  the one that is set agrees with `subject_type`.
- `UNIQUE (rule_id, subject_type, member_id, group_id)`, plus `(member_id)` and
  `(group_id)` for the reverse sweep.

- [ ] **Step 1: Declare both tables** in `types.ts` and `schemaManifest.ts`
- [ ] **Step 2: Run the schema test.** Expected: FAIL
- [ ] **Step 3: Write `0002_visibility.ts`**
- [ ] **Step 4: Register it** in `migrations.ts`
- [ ] **Step 5: Run the schema test.** Expected: PASS
- [ ] **Step 6: Run type-check.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the visibility rule tables"
```

---

### Task 6: Migration 0003, the archive

**Files:**

- Create: `apps/server/src/db/migrations/0003_archive.ts`
- Modify: `migrations.ts`, `types.ts`, `schemaManifest.ts`

**Section:** `data-models.md` § The archive
**Tables:** `items`, `item_renditions`, `bursts`, `milestones`,
`item_milestones`, `item_capture_date_changes`, `tags`, `item_tags`, `people`,
`item_people`

This is the largest group and the one the archive grows with. Read the whole
section before writing anything.

**Traps in this group:**

- **`items` and `bursts` reference each other.** `items.burst_id` points at
  `bursts` (`SET NULL`) and `bursts.cover_item_id` points at `items`
  (`SET NULL`). SQLite resolves a foreign key's target at DML time rather than
  DDL time, so the cycle is fine as long as both tables exist before any row is
  written. **Do not try to break the cycle**; create `items` first, then
  `bursts`, and let the forward reference stand.
- **`items.upload_session_id` and `bursts.upload_session_id` point at a table
  migration 0006 creates.** Same lazy resolution. This is expected.
- **`items.capture_source` has no `'manual'` member.** The permitted set is
  `('exif','video_metadata','filename','file_mtime','uploader_set','upload_time')`.
  `item_capture_date_changes.reason` **does** have one, and its set is
  `('milestone_reconcile','manual','timezone_change')`. Two API slices misread
  this before it was settled: one column records **how** a date was arrived at,
  the other **why** it was changed.
- **`bursts` has no `frame_count` column, and this is not an oversight.**
  Visibility is per item, so a stored count is the unfiltered count and would
  leak restricted frames through a denominator. Do not add one.
- **`item_renditions` cascades from `items` and has a side effect outside the
  database**: each deleted row needs an object delete enqueued. The enqueue is
  application code in a later step; this migration only builds the table and
  its `UNIQUE (item_id, purpose)` and `UNIQUE (storage_key)`.
- **`items.width` and `items.height` are post-orientation**, which is a note
  for whoever writes ingest rather than a constraint here.

- [ ] **Step 1: Declare the ten tables** in `types.ts` and `schemaManifest.ts`
- [ ] **Step 2: Run the schema test.** Expected: FAIL
- [ ] **Step 3: Write `0003_archive.ts`**, creating `items` before `bursts`
- [ ] **Step 4: Register it** in `migrations.ts`
- [ ] **Step 5: Run the schema test.** Expected: PASS
- [ ] **Step 6: Run type-check.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the archive tables"
```

---

### Task 7: Migration 0004, comments and reactions

**Files:**

- Create: `apps/server/src/db/migrations/0004_comments_and_reactions.ts`
- Modify: `migrations.ts`, `types.ts`, `schemaManifest.ts`

**Section:** `data-models.md` § Comments and reactions
**Tables:** `comments`, `item_reactions`, `comment_reactions`

**Traps in this group:**

- **Two reaction tables, not one polymorphic table.** The section argues it:
  one table with a nullable `item_id` and a nullable `comment_id` cannot have a
  working foreign key on either, and the unique constraint that stops a double
  reaction becomes conditional. Do not merge them.
- **`comments.author_member_id` is `RESTRICT`**, which is what makes "their
  name stays on it" true after a member is removed.
- **`comments` has a `CHECK (length(trim(body)) > 0)`.** An empty comment is
  not a comment.
- The video timestamp column is nullable and is only set for comments pinned to
  a moment.

- [ ] **Step 1: Declare the three tables** in `types.ts` and `schemaManifest.ts`
- [ ] **Step 2: Run the schema test.** Expected: FAIL
- [ ] **Step 3: Write `0004_comments_and_reactions.ts`**
- [ ] **Step 4: Register it** in `migrations.ts`
- [ ] **Step 5: Run the schema test.** Expected: PASS
- [ ] **Step 6: Run type-check.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the comment and reaction tables"
```

---

### Task 8: Migration 0005, moderation

**Files:**

- Create: `apps/server/src/db/migrations/0005_moderation.ts`
- Modify: `migrations.ts`, `types.ts`, `schemaManifest.ts`

**Section:** `data-models.md` § `removal_requests`
**Tables:** `removal_requests`

**Traps in this group:**

- **`item_id` is `SET NULL`, the one exception in the whole schema**, so
  takedown history survives the takedown. Everything else that references
  `items` cascades.
- **The snapshot columns are load-bearing**, in particular
  `item_uploader_member_id` and `item_captured_at`. They are what lets a
  settled request still say what it was about after the photograph is gone.
- **`CHECK ((state = 'open') = (resolved_at IS NULL))`.** This is what makes a
  request resolve exactly once, in the database rather than in a handler.
- **A partial unique index**:
  `UNIQUE (item_id, requested_by_member_id) WHERE state = 'open'`. One open
  request per person per photograph, and withdrawing frees it so they may ask
  again. Kysely expresses this with `.where()` on `createIndex`.
- `state` is `CHECK IN ('open','deleted','declined','withdrawn')`.
- **`decline_reason` is compulsory when declining**:
  `CHECK (state <> 'declined' OR decline_reason IS NOT NULL)`.

- [ ] **Step 1: Declare the table** in `types.ts` and `schemaManifest.ts`
- [ ] **Step 2: Run the schema test.** Expected: FAIL
- [ ] **Step 3: Write `0005_moderation.ts`**
- [ ] **Step 4: Register it** in `migrations.ts`
- [ ] **Step 5: Run the schema test.** Expected: PASS
- [ ] **Step 6: Run type-check.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the removal request table"
```

---

### Task 9: Migration 0006, upload

**Files:**

- Create: `apps/server/src/db/migrations/0006_upload.ts`
- Modify: `migrations.ts`, `types.ts`, `schemaManifest.ts`

**Section:** `data-models.md` § Upload
**Tables:** `upload_sessions`, `upload_files`, `upload_batch_edits`,
`upload_batch_edit_targets`, `pending_object_deletions`

**Traps in this group:**

- **`upload_sessions` needs `INDEX (uploaded_by, state)`.** The data model
  declares indexes for `upload_files` only; this one was added by the question
  walk, for `GET /api/upload-sessions/current` and the one-open-session
  conflict check.
- **`upload_files.item_id` is `SET NULL`**, because the transfer record
  outlives the photograph: the original filename and the transfer outcome live
  nowhere else.
- **`upload_files` carries its own `original_captured_at`**, holding what the
  five-rung ladder decided, separately from the `captured_at` an uploader may
  amend before ingest. Without it, "revert to what the file said" is quietly
  wrong for any amended item.
- **`upload_files` unique constraints**: `UNIQUE (upload_session_id, position)`;
  `UNIQUE (storage_key) WHERE storage_key IS NOT NULL`; and
  `UNIQUE (upload_session_id, content_hash) WHERE content_hash IS NOT NULL`
  for idempotent retry. Two of the three are partial.
- **`upload_sessions.client_timezone` is a diagnostic column only.** Nothing
  resolves against it; Decision 10 resolves in `shoebox.timezone`. Keep the
  column, and do not wire it to anything.
- **`pending_object_deletions` has no foreign key to `items`**, because the
  rows it holds outlive the item by design.

- [ ] **Step 1: Declare the five tables** in `types.ts` and `schemaManifest.ts`
- [ ] **Step 2: Run the schema test.** Expected: FAIL
- [ ] **Step 3: Write `0006_upload.ts`**
- [ ] **Step 4: Register it** in `migrations.ts`
- [ ] **Step 5: Run the schema test.** Expected: PASS. The forward references
      from `items` and `bursts` in migration 0003 now resolve
- [ ] **Step 6: Run type-check.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the upload tables"
```

---

### Task 10: Migration 0007, operations and audit

**Files:**

- Create: `apps/server/src/db/migrations/0007_operations_and_audit.ts`
- Modify: `migrations.ts`, `types.ts`, `schemaManifest.ts`

**Sections:** `data-models.md` § Operations and § Usage and audit
**Tables:** `settings`, `outbound_emails`, `email_delivery_events`,
`email_suppressions`, `item_views`, `activity_events`

**`email_delivery_events` and `email_suppressions` are defined in one sentence
inside § `outbound_emails`**, not under headings. Do not miss them.

**Traps in this group:**

- **`activity_events.subject_id` has NO foreign key**, deliberately. An audit
  log outlives its subjects, so an `item_deleted` row must hold a dangling id.
  Referential integrity here would either forbid the row or cascade it away
  exactly when it becomes valuable.
- **`activity_events` denormalises `actor_label`, `subject_label` **and**
  `device_label`.** The third was added by the question walk: `device_id` is
  `SET NULL` to `sessions`, which fall out at 30 days idle, so without it
  surface 18 reads "device no longer known" on most of the log.
- **`outbound_emails.idempotency_key` is `UNIQUE`** and is the only thing
  standing between a retried handler and two hundred duplicate emails.
- **`outbound_emails` needs `(state, next_attempt_at)`** for the worker's claim
  and **`(state, created_at)`** for the health grouping. Both were added by the
  question walk.
- **`item_views` needs four indexes**: `UNIQUE (member_id, item_id)`,
  `(item_id, member_id)`, a partial
  `(item_id) WHERE first_opened_at IS NOT NULL`, and its mirror
  `(member_id) WHERE first_opened_at IS NOT NULL`. The last was added by the
  question walk for surface 17's grouping.
- **`email_delivery_events` takes `UNIQUE (email_id, event, occurred_at)`** for
  webhook replay safety.
- **`settings` holds no rows on a fresh instance.** Every key resolves from
  `SETTING_DEFINITIONS` instead, which Task 14 builds. No seed migration.
- **No `member_active_days` and no `*_rule_counts` tables.** Both are named in
  the document and both say not to build them.

- [ ] **Step 1: Declare the six tables** in `types.ts` and `schemaManifest.ts`
- [ ] **Step 2: Run the schema test.** Expected: FAIL
- [ ] **Step 3: Write `0007_operations_and_audit.ts`**
- [ ] **Step 4: Register it** in `migrations.ts`
- [ ] **Step 5: Run the schema test.** Expected: PASS, and it now compares all
      thirty-three tables
- [ ] **Step 6: Run type-check.** Expected: PASS
- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db
git commit -m "feat: add the operations and audit tables"
```

---

## Task 11: Assert every relationship and index

**Files:**

- Create: `apps/server/src/db/schemaExpectations.ts`
- Modify: `apps/server/test/schema.test.ts`

The manifest covers tables and columns. This covers the parts that are easy to
write and easy to get wrong, and where being wrong is invisible until somebody
loses data.

- [ ] **Step 1: Write the failing test**

Add these two imports to the **top** of `apps/server/test/schema.test.ts`,
beside the existing ones, and merge the second into the `introspect.ts` import
that is already there rather than writing a duplicate:

```ts
import {
  EXPECTED_FOREIGN_KEYS,
  EXPECTED_INDEXES,
} from "../src/db/schemaExpectations.ts";
import {
  readColumns,
  readForeignKeys,
  readIndexes,
  readTableNames,
} from "../src/db/introspect.ts";
```

Then append these blocks to the end of the file:

```ts
describe("relationships", () => {
  it("carries the exact delete rule the data model names", async () => {
    for (const [tableName, expected] of Object.entries(EXPECTED_FOREIGN_KEYS)) {
      const actual = await readForeignKeys(database, tableName);
      expect(actual, `foreign keys of ${tableName}`).toEqual(expected);
    }
  });

  it("gives activity_events no foreign key on subject_id", async () => {
    const keys = await readForeignKeys(database, "activity_events");
    const subject = keys.find((key) => {
      return key.column === "subject_id";
    });
    expect(subject).toBeUndefined();
  });

  it("keeps takedown history when the photograph goes", async () => {
    const keys = await readForeignKeys(database, "removal_requests");
    const item = keys.find((key) => {
      return key.column === "item_id";
    });
    expect(item?.onDelete).toBe("SET NULL");
  });

  it("refuses to cascade a group deletion into a visibility rule", async () => {
    const keys = await readForeignKeys(database, "visibility_rule_subjects");
    const group = keys.find((key) => {
      return key.column === "group_id";
    });
    expect(group?.onDelete).toBe("RESTRICT");
  });
});

describe("indexes", () => {
  it("declares every index the data model calls for", async () => {
    for (const [tableName, expected] of Object.entries(EXPECTED_INDEXES)) {
      const actual = await readIndexes(database, tableName);
      expect(
        actual.map((index) => {
          return index.name;
        }),
        `indexes of ${tableName}`,
      ).toEqual(expected);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @memory-shoebox/server test schema`
Expected: FAIL, `Cannot find module '../src/db/schemaExpectations.ts'`

- [ ] **Step 3: Write the expectations**

Create `apps/server/src/db/schemaExpectations.ts`, transcribing every foreign
key and index from `data-models.md` into two records. The shape:

```ts
import type { ForeignKeyInfo } from "./introspect.ts";

/**
 * Every foreign key, with the delete rule `data-models.md` names for it.
 *
 * This exists because a cascade is the one thing in a schema that is both
 * trivial to write wrong and invisible when it is: nothing fails until a
 * deletion takes something it should have left, and by then the row is gone.
 * Keyed by table, ordered by column, which is the order `readForeignKeys`
 * returns.
 */
export const EXPECTED_FOREIGN_KEYS: Record<string, ForeignKeyInfo[]> = {
  group_members: [
    {
      column: "group_id",
      referencesTable: "groups",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
    {
      column: "member_id",
      referencesTable: "members",
      referencesColumn: "id",
      onDelete: "CASCADE",
    },
  ],
  // ... one entry per table that has a foreign key
};

/**
 * Every index a migration declared, by name, per table.
 *
 * Implicit indexes are excluded by `readIndexes`, so this lists only what a
 * `CREATE INDEX` asked for.
 */
export const EXPECTED_INDEXES: Record<string, string[]> = {
  group_members: ["group_members_member_group"],
  // ... one entry per table that has a declared index
};
```

**`EXPECTED_INDEXES` lists declared indexes only, and that is a real
distinction.** `readIndexes` filters to `origin = 'c'`, meaning created by
`CREATE INDEX`. A uniqueness rule written as a column-level `UNIQUE` produces
an implicit index and **will not appear**; the same rule written as a
`CREATE UNIQUE INDEX` **will**. Migration 0001 already has one of each:
`sessions.token_hash` is a declared unique index and belongs in the
expectations, while `members.email` and `groups.name_normalized` are
column-level and must not be listed. That mirrors how `data-models.md` itself
presents them, under "Indexes" and "Unique" respectively. If an expectation
and a constraint disagree, check which form the document used before changing
either.

**Work through this checklist**, which is every table that has a foreign key.
Deriving it yourself from thirty-three sections is where one gets missed:

| Table                       | References                                                                      |
| --------------------------- | ------------------------------------------------------------------------------- |
| `sign_in_codes`             | `members`                                                                       |
| `sessions`                  | `members`                                                                       |
| `invitations`               | `members` twice: the invitee and the inviter                                    |
| `group_members`             | `groups`, `members`                                                             |
| `visibility_rule_subjects`  | `visibility_rules`, `members`, `groups` **(RESTRICT)**                          |
| `items`                     | `members`, `visibility_rules`, `upload_sessions`, `bursts`                      |
| `item_renditions`           | `items`                                                                         |
| `bursts`                    | `upload_sessions`, `items` (the cover)                                          |
| `milestones`                | `members`                                                                       |
| `item_milestones`           | `items`, `milestones`, `members`                                                |
| `item_capture_date_changes` | `items`, `members`                                                              |
| `item_tags`                 | `items`, `tags`, `members`                                                      |
| `item_people`               | `items`, `people`, `members`                                                    |
| `comments`                  | `items`, `members`                                                              |
| `item_reactions`            | `items`, `members`                                                              |
| `comment_reactions`         | `comments`, `members`                                                           |
| `removal_requests`          | `items` **(SET NULL)**, `members`                                               |
| `upload_sessions`           | `members`                                                                       |
| `upload_files`              | `upload_sessions`, `items` **(SET NULL)**                                       |
| `upload_batch_edits`        | `upload_sessions`                                                               |
| `upload_batch_edit_targets` | `upload_batch_edits`, `upload_files`                                            |
| `outbound_emails`           | `members` **(SET NULL)**                                                        |
| `email_delivery_events`     | `outbound_emails`                                                               |
| `item_views`                | `members`, `items`                                                              |
| `activity_events`           | `members` **(SET NULL)**, `sessions` **(SET NULL)**. **No key on `subject_id`** |

**Five tables have no foreign key at all**, and an entry appearing for one of
them means a relationship was invented: `members`, `groups`,
`visibility_rules`, `email_suppressions`, `pending_object_deletions`.

An earlier draft of this list said eight, wrongly including `tags`, `people`
and `settings`. All three do have keys, each stated plainly in the document:
`tags.created_by` and `settings.updated_by_member_id` are `SET NULL` to
`members`, and `people` carries three. The implementer of this task caught all
three by transcribing from `data-models.md` rather than from the list, which is
what the task says to do and why it says so.

The cascade matrix in § Deleting an item checks the `items` relationships in
one pass. Every other rule comes from the table's own section.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @memory-shoebox/server test schema`
Expected: PASS. Every mismatch it reports is a real one: fix the migration, not
the expectation, unless you have checked the document and the expectation is
the thing that is wrong.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/schemaExpectations.ts apps/server/test/schema.test.ts
git commit -m "test: assert every cascade and index against the data model"
```

---

## Task 11b: Prove the two lookalike enums apart

**Files:**

- Modify: `apps/server/test/schema.test.ts`

`items.capture_source` and `item_capture_date_changes.reason` look like the
same enum and are not. Two API slices already misread this once. Getting them
the wrong way round type-checks green, passes every other test in this plan,
and is caught by nothing else, so it gets a test of its own.

- [ ] **Step 1: Write the test**

Append to `apps/server/test/schema.test.ts`:

```ts
import { sql } from "kysely";

describe("the two capture enums, which are not the same enum", () => {
  const insertItemWith = async (captureSource: string): Promise<void> => {
    await sql`
      INSERT INTO items (id, capture_source) VALUES ('probe', ${captureSource})
    `.execute(database);
  };

  it("permits 'uploader_set' on an item and refuses 'manual'", async () => {
    await expect(insertItemWith("manual")).rejects.toThrow(/CHECK constraint/);
    await expect(insertItemWith("uploader_set")).resolves.not.toThrow();
  });

  it("permits 'manual' as a reason for a capture date change", async () => {
    const permitted = await sql<{ sql: string }>`
      SELECT sql FROM sqlite_master WHERE name = 'item_capture_date_changes'
    `.execute(database);
    expect(permitted.rows[0]?.sql).toContain("manual");
    expect(permitted.rows[0]?.sql).toContain("timezone_change");
  });
});
```

The first test's insert will need every other `NOT NULL` column on `items`
filled in. Write the helper to supply them, or build the row with Kysely's
query builder, whichever reads better once the real column list is in front of
you. What matters is that the `CHECK` is what rejects it.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @memory-shoebox/server test schema`
Expected: PASS. If the first case passes for `manual`, migration 0003 widened a
`CHECK` it should not have.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/schema.test.ts
git commit -m "test: keep capture_source and capture-change reason apart"
```

---

## Task 12: Split packages/shared into modules

**Files:**

- Create: `packages/shared/src/health.ts`
- Create: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`

A pure refactor, done before anything is added so the additions land in the
right place. The public import path does not change.

- [ ] **Step 1: Run the existing tests to establish green**

Run: `pnpm test`
Expected: PASS. `apps/web` imports `apiErrorSchema` and both health schemas, so
these tests are the safety net for this move.

- [ ] **Step 2: Move the health schemas**

Create `packages/shared/src/health.ts` with `healthResponseSchema` and
`HealthResponse`, moved verbatim from `index.ts` including their docstrings.

- [ ] **Step 3: Move and extend the error envelope**

Create `packages/shared/src/errors.ts`:

```ts
import { z } from "zod";

/**
 * Structured detail on a failure, for the three cases that need more than a
 * code. `message` is English and is never the primary UI copy, so anything the
 * interface has to render as a number or a field name belongs here instead.
 */
export const apiErrorDetailsSchema = z.object({
  /** Per-field validation failures, keyed by field name. */
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  /** Seconds until a rate-limited caller may retry. */
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  /** Sign-in attempts left before the code is replaced. */
  attemptsRemaining: z.number().int().nonnegative().optional(),
});

/** Structured detail on a failure. */
export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;

/**
 * Error body returned by every failing API route.
 *
 * `error` is a stable snake_case code and is what the client branches on.
 * `message` is English, for a log or a fallback, never for the interface.
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: apiErrorDetailsSchema.optional(),
});

/** Error body returned by every failing API route. */
export type ApiError = z.infer<typeof apiErrorSchema>;
```

- [ ] **Step 4: Reduce index.ts to a barrel**

Replace `packages/shared/src/index.ts` with:

```ts
/**
 * The API contract shared by the server and the web app.
 *
 * Each endpoint contributes a Zod schema plus the type inferred from it, so
 * there is a single source of truth for every payload crossing the wire. The
 * web app parses responses with the schema; the server annotates its handlers
 * with the type.
 *
 * This file is a barrel and holds no definitions: the contract is large enough
 * that one file would be unreadable, and the import path stays
 * `@memory-shoebox/shared` either way.
 *
 * Both halves may import at runtime. The server runs TypeScript directly
 * through Node's type stripping, and a runtime import from this package has
 * been verified to load under it (`docs/shared.md`).
 */
export * from "./errors.ts";
export * from "./health.ts";
```

Note: the `.ts` extensions here are required, because the server resolves these
literally under type stripping.

- [ ] **Step 5: Run the tests**

Run: `pnpm check`
Expected: PASS, everything green. Nothing imported from a new path, so
`apps/web` is untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "refactor: split the shared contract into modules behind a barrel"
```

---

## Task 13: The string caps

**Files:**

- Create: `packages/shared/src/limits.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the module**

Create `packages/shared/src/limits.ts`:

```ts
/**
 * Every length cap in the contract, in one place.
 *
 * Three route slices each proposed their own numbers for overlapping fields
 * before this existed. None of these is a database `CHECK`: they are product
 * judgements and should change without a migration.
 *
 * From `tech-specs/apis/conventions.md` § String lengths.
 */
export const LIMITS = {
  /**
   * Every free-text field a person types shares one number. A second number
   * is a second thing to get wrong, and the real limit on a removal reason is
   * social rather than technical.
   */
  freeTextMaxLength: 4000,
  /** Enough for "Abuela Rosa", short enough that a chip is not a billboard. */
  displayNameMaxLength: 80,
  /** A label, not a sentence. */
  tagNameMaxLength: 100,
  /** A label, not a sentence. */
  groupNameMaxLength: 100,
  /** "A week at the grandparents'", and rather more. */
  milestoneNameMaxLength: 200,
  /** Prose for a screen reader. The generated string is far shorter. */
  altTextMaxLength: 2000,
  /** Generous enough that nobody meets it by accident. */
  itemMaxTags: 50,
  /** Low enough that a bulk action cannot turn one photograph into an index. */
  itemMaxPeople: 30,
} as const;
```

- [ ] **Step 2: Export it from the barrel**

Add to `packages/shared/src/index.ts`:

```ts
export * from "./limits.ts";
```

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src
git commit -m "feat: settle every string cap in one place"
```

---

## Task 14: The twelve frozen DTOs

**Files:**

- Create: `packages/shared/src/dtos.ts`
- Modify: `packages/shared/src/index.ts`

**Source:** `tech-specs/apis/conventions.md` § The frozen DTOs. Copy the twelve
from there rather than from memory, in this order: `ReactionKind`,
`MediaSource`, `MediaRef`, `MemberRef`, `PersonRef`, `TagRef`, `MilestoneRef`,
`VisibilitySummary`, `BurstSummary`, `ItemSummary`, `ReactionSummary`,
`CommentDto`. `TagRef` and `ReactionSummary` are the two most often overlooked.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/dtos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mediaRefSchema, reactionKindSchema } from "../src/dtos.ts";

describe("reactionKindSchema", () => {
  it("accepts the six kinds and nothing else", () => {
    for (const kind of ["like", "love", "care", "haha", "wow", "sad"]) {
      expect(reactionKindSchema.safeParse(kind).success).toBe(true);
    }
    expect(reactionKindSchema.safeParse("angry").success).toBe(false);
  });
});

describe("mediaRefSchema", () => {
  it("requires a poster and a video key, nullable, so a photo and a video parse the same shape", () => {
    const source = {
      url: "https://example.test/a.jpg",
      expiresAt: "2026-09-27T00:00:00.000Z",
      width: 100,
      height: 80,
    };
    const photograph = {
      thumb: source,
      display: source,
      poster: null,
      video: null,
      altText: "A newborn asleep on his father's chest.",
    };
    expect(mediaRefSchema.safeParse(photograph).success).toBe(true);
  });

  it("rejects a storage key in place of a url", () => {
    const bad = {
      thumb: {
        url: "items/4620/thumb.jpg",
        expiresAt: "",
        width: 1,
        height: 1,
      },
      display: null,
      poster: null,
      video: null,
      altText: "",
    };
    expect(mediaRefSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: FAIL, `Cannot find module '../src/dtos.ts'`

- [ ] **Step 3: Write the module**

Create `packages/shared/src/dtos.ts` with all twelve, each as a Zod schema plus
its inferred type, following the `healthResponseSchema` / `HealthResponse`
pattern. Transcribe the field lists from `conventions.md` § The frozen DTOs.

Two things that section makes explicit and that the schemas must preserve:

- **`MediaSource.url` is a signed URL with an `expiresAt`, never a storage
  key.** `conventions.md` § Forbidden in any payload bans raw keys outright.
- **Nothing carries a formatted or relative date.** Every timestamp is
  ISO-8601 and the browser formats it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @memory-shoebox/shared test`
Expected: PASS

- [ ] **Step 5: Export from the barrel and verify**

Add `export * from "./dtos.ts";` to `index.ts`, then run `pnpm check`.
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src packages/shared/test
git commit -m "feat: add the twelve frozen DTOs"
```

---

## Task 15: SETTING_DEFINITIONS

**Files:**

- Create: `packages/shared/src/settings.ts`
- Create: `packages/shared/test/settings.test.ts`
- Modify: `packages/shared/src/index.ts`

**Source:** `tech-specs/apis/conventions.md` § `SETTING_DEFINITIONS`. Nine keys:
`shoebox.name`, `pile.arrangement`, `shoebox.timezone`, `mail.from_address`,
`mail.from_name`, `mail.domain_verified_at`, `mail.domain_last_check_error`,
`public.base_url`, `visibility.generation`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS, resolveSetting } from "../src/settings.ts";

describe("SETTING_DEFINITIONS", () => {
  it("covers every key the contract names", () => {
    expect(Object.keys(SETTING_DEFINITIONS).sort()).toEqual([
      "mail.domain_last_check_error",
      "mail.domain_verified_at",
      "mail.from_address",
      "mail.from_name",
      "pile.arrangement",
      "public.base_url",
      "shoebox.name",
      "shoebox.timezone",
      "visibility.generation",
    ]);
  });

  it("marks exactly two keys publicly readable", () => {
    const publicKeys = Object.entries(SETTING_DEFINITIONS)
      .filter(([, definition]) => {
        return definition.isPubliclyReadable;
      })
      .map(([key]) => {
        return key;
      })
      .sort();
    expect(publicKeys).toEqual(["public.base_url", "shoebox.name"]);
  });

  it("keeps pile.arrangement instance-scoped, never per member", () => {
    expect(SETTING_DEFINITIONS["pile.arrangement"].scopes).toEqual([
      "instance",
    ]);
  });
});

describe("resolveSetting", () => {
  it("returns the default when a fresh instance holds no rows", () => {
    expect(resolveSetting("shoebox.name", undefined)).toBe("My Shoebox");
  });

  it("parses a stored value through the key's own schema", () => {
    expect(resolveSetting("visibility.generation", "7")).toBe(7);
  });

  it("falls back to the default when a stored value is malformed", () => {
    expect(resolveSetting("visibility.generation", "banana")).toBe(0);
  });
});
```

The last case matters: a malformed row must not stop a Shoebox rendering. A
corrupted setting is a degraded instance, not a dead one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @memory-shoebox/shared test settings`
Expected: FAIL, `Cannot find module '../src/settings.ts'`

- [ ] **Step 3: Write the module**

Create `packages/shared/src/settings.ts` defining `SettingDefinition`, the nine
entries, and `resolveSetting`. Each definition carries its Zod schema, its
default, its permitted scopes, and `isPubliclyReadable`.

Two rules the shape enforces, both from `conventions.md`:

- **`scopes` is load-bearing.** It is what stops `pile.arrangement` quietly
  becoming a personal preference later.
- **`isPubliclyReadable` is load-bearing in the other direction.** A key is
  readable without a session because it carries the flag, never because a route
  forgot to check.

`resolveSetting` takes a key and the raw stored string or `undefined`, parses
through that key's schema, and returns the default on absence or on a parse
failure.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @memory-shoebox/shared test settings`
Expected: PASS, 6 tests

- [ ] **Step 5: Export from the barrel and verify**

Add `export * from "./settings.ts";` to `index.ts`, then run `pnpm check`.
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src packages/shared/test
git commit -m "feat: add SETTING_DEFINITIONS and default resolution"
```

---

## Task 16: Prove the server can import it at runtime

**Files:**

- Create: `apps/server/test/sharedRuntimeImport.test.ts`

The design rests on a fact that was probed by hand and is not yet defended by
anything. `SETTING_DEFINITIONS` is a runtime value in `packages/shared` and the
server needs it at runtime, which `docs/shared.md` warned was delicate. A test
keeps it true.

- [ ] **Step 1: Write the test**

Create `apps/server/test/sharedRuntimeImport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS, resolveSetting } from "@memory-shoebox/shared";

/**
 * `docs/shared.md` says the server imports types only from the shared package,
 * because runtime imports of workspace TypeScript source are delicate under
 * Node's type stripping. `SETTING_DEFINITIONS` is the first runtime value the
 * server genuinely needs from it, so this test is the standing proof that the
 * import still works. If it ever fails, the fix is to move settings resolution
 * into `apps/server`, not to delete this test.
 */
describe("runtime imports from @memory-shoebox/shared", () => {
  it("loads a runtime value, not just a type", () => {
    expect(Object.keys(SETTING_DEFINITIONS)).toContain("shoebox.name");
  });

  it("runs code from the package", () => {
    expect(resolveSetting("shoebox.name", undefined)).toBe("My Shoebox");
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @memory-shoebox/server test sharedRuntimeImport`
Expected: PASS, 2 tests

- [ ] **Step 3: Verify it under the real runtime, not just the test runner**

Vitest bundles, which is not how the server loads code. Confirm under Node
itself:

```bash
node --input-type=module -e "import('@memory-shoebox/shared').then((m) => console.log(Object.keys(m.SETTING_DEFINITIONS).length))"
```

Run from `apps/server`. Expected: `9`

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/sharedRuntimeImport.test.ts
git commit -m "test: keep the server's runtime import from shared working"
```

---

## Task 17: Update the documentation

**Files:**

- Modify: `docs/shared.md`
- Modify: `docs/server.md`
- Modify: `docs/prds/2026-09-27-memory-shoebox/tech-specs/data-models.md`

`AGENTS.md` makes this part of the definition of done rather than a follow-up.

- [ ] **Step 1: Record the runtime-import result in `docs/shared.md`**

That file asks whoever tests a runtime import to record the result. Replace the
"until then" paragraph with what was found: a runtime import from
`@memory-shoebox/shared` loads under Node's type stripping, `SETTING_DEFINITIONS`
relies on it, and `apps/server/test/sharedRuntimeImport.test.ts` keeps it true.
Note the one thing still unproven: it was verified in the development workspace
and not inside the production container, where the mitigation is a startup
smoke test.

- [ ] **Step 2: Describe the schema in `docs/server.md`**

Add the seven migrations and what each group holds, at the level a reader needs
to find the right file. Do not restate columns: `data-models.md` has them.

**Record one known piece of debt while you are there.** Migration 0002 seeds
the `everyone` visibility rule and exports its constant id as
`EVERYONE_VISIBILITY_RULE_ID` from `0002_visibility.ts`. Two API slices will
resolve to that id at runtime, and migrations are meant to be frozen once
shipped, so runtime code importing a value out of a historical migration file
is a coupling nobody wants. Both the implementer and the reviewer of that
migration raised it independently. Nothing imports it yet, so it is not a bug
today. The fix, for whichever later step first needs the constant: move it to a
non-migration module and have the migration import it, rather than the reverse.

- [ ] **Step 3: Correct `data-models.md`**

Its opening says "Nothing here is built. `apps/server/src/db/types.ts` is still
empty and there are no migrations." All three clauses are now false. Say what
is true: the schema is implemented by the seven migrations, `types.ts` mirrors
it, and `schemaManifest.ts` plus `schemaExpectations.ts` are what stop the
document and the database drifting apart.

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: record the schema as built, and the shared runtime import as verified"
```

---

## Done when

- `pnpm check` is green
- `rm -f data/memory-shoebox.db && pnpm migrate && pnpm migrate` succeeds, and
  the second run reports the database is already up to date
- `apps/server/test/schema.test.ts` compares thirty-three tables, every column,
  every foreign key with its exact delete rule, and every declared index
  against a database the migrations built
- `packages/shared` exports the twelve frozen DTOs, `SETTING_DEFINITIONS`, the
  caps and the error envelope, and the server can import the runtime ones
