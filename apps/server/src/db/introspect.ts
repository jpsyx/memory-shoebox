import { sql, type Kysely } from "kysely";
import type { Database } from "./types.ts";

/** One column as SQLite reports it. */
export type ColumnInfo = {
  readonly name: string;
  readonly isNullable: boolean;
  /**
   * The declared type, verbatim. This schema uses `TEXT`, `INTEGER` and
   * `REAL`. SQLite reports what the migration wrote rather than a normalised
   * form, so a column retyped from `INTEGER` to `TEXT` shows up here even
   * though SQLite would happily store either value in either column.
   */
  readonly type: string;
  /**
   * The `DEFAULT` expression as written, or null where the column declares
   * none. String defaults arrive quoted, so `DEFAULT 'viewer'` reads back as
   * `'viewer'` with the quotes included.
   */
  readonly defaultValue: string | null;
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
  readonly type: string;
  readonly dflt_value: string | null;
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
 * actually enforces: nullability, declared type, and default expression.
 *
 * **`pk` is deliberately not consulted.** SQLite permits a null in a
 * non-INTEGER primary key, so a column declared `id TEXT PRIMARY KEY` without
 * `NOT NULL` really does accept a null id. An earlier draft treated any
 * primary key as not-nullable, which made this function unable to see exactly
 * that mistake on any of the thirty-three `id` columns the migrations write.
 * The whole point of reading the live database is to catch what the migration
 * source hides, so report `notnull` and nothing else about the key.
 *
 * `type` and `dflt_value` are read for that same reason. SQLite's affinity
 * rules mean `items.byte_size` retyped from `INTEGER` to `TEXT` still stores
 * every number the application writes, and a dropped `DEFAULT 3` on
 * `sign_in_codes.max_attempts` surfaces only on the one insert that omits the
 * column. Neither is visible in a nullability check, so both are read here.
 */
export async function readColumns(
  database: Kysely<Database>,
  tableName: string,
): Promise<ColumnInfo[]> {
  const result = await sql<TableInfoRow>`
    SELECT name, "notnull", type, dflt_value
      FROM pragma_table_info(${tableName})
  `.execute(database);
  return result.rows.map((row) => {
    return {
      name: row.name,
      isNullable: row.notnull === 0,
      type: row.type,
      defaultValue: row.dflt_value,
    };
  });
}

/**
 * Every foreign key of one table, with the delete rule that governs it.
 *
 * Assumes single-column foreign keys. `pragma_foreign_key_list` returns one
 * row per column of a composite key, with all the rows of one key sharing an
 * `id`; this function drops both `id` and `seq`, so a composite key would
 * come back as several single-column keys instead of one multi-column key.
 * This schema has none.
 */
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

/** The columns one index covers, in index order. */
async function readIndexColumns(
  database: Kysely<Database>,
  indexName: string,
): Promise<string[]> {
  const info = await sql<IndexInfoRow>`
    SELECT name, seqno FROM pragma_index_info(${indexName}) ORDER BY seqno
  `.execute(database);
  return info.rows
    .map((column) => {
      return column.name;
    })
    .filter((name): name is string => {
      return name !== null;
    });
}

/**
 * Every index a migration declared on one table with `CREATE INDEX`, with the
 * columns it covers and whether it is unique.
 *
 * Filters to `origin = 'c'`, which is "created by CREATE INDEX". **The
 * consequence is that this function cannot see a table-level `UNIQUE`
 * constraint at all**: SQLite builds those as `origin = 'u'` autoindexes, four
 * of this schema's uniques are declared that way, and `readUniqueConstraints`
 * below is what reads them. `origin = 'pk'` stays excluded on purpose, since
 * every table has a primary key and listing thirty-three of them asserts
 * nothing.
 *
 * Three limitations, deliberate and recorded so they read as choices rather
 * than oversights:
 *
 * - An index on an **expression** rather than a column yields a null column
 *   name from `pragma_index_info`, which this function currently filters out.
 *   That would make such an index look complete (just with fewer columns than
 *   it has) rather than flagging that an expression index exists at all.
 * - A **partial** index (`CREATE INDEX ... WHERE ...`) is indistinguishable
 *   here from a full index on the same columns, because the predicate lives in
 *   `sqlite_master.sql` rather than in `pragma_index_info`. This schema has
 *   several partial indexes, so `schema.test.ts` asserts their predicates
 *   separately.
 * - **Column direction is not reported.** `pragma_index_info` carries no
 *   `desc` flag, so `(captured_on DESC, ...)` and `(captured_on, ...)` read
 *   identically here. An index that lost its descending order would keep its
 *   name, its columns and its uniqueness, and pass.
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
      return {
        name: row.name,
        columns: await readIndexColumns(database, row.name),
        isUnique: row.unique === 1,
      };
    }),
  );
}

/**
 * Every table-level `UNIQUE` constraint on one table, as the column lists it
 * refuses to repeat, sorted.
 *
 * The other half of `readIndexes`, and it exists because
 * `UNIQUE (group_id, member_id)` written inside a `CREATE TABLE` and
 * `CREATE UNIQUE INDEX ... ON group_members (group_id, member_id)` enforce the
 * identical rule while appearing in different pragmas. Four of this schema's
 * uniques take the first form and were therefore asserted nowhere:
 * `members.email`, `groups.name_normalized`, `tags.name_normalized`, and
 * `group_members (group_id, member_id)`.
 *
 * **Column lists rather than names**, because SQLite invents the name:
 * `sqlite_autoindex_members_2`, where the `2` counts autoindexes on the table
 * and so depends on the order in which `PRIMARY KEY` and `UNIQUE` were
 * declared. Pinning that would assert a name no migration wrote and would
 * break when a migration merely reordered two constraint lines. What is worth
 * pinning is which column sets the database refuses to repeat.
 *
 * `origin = 'pk'` is excluded for the same reason `readIndexes` excludes it.
 */
export async function readUniqueConstraints(
  database: Kysely<Database>,
  tableName: string,
): Promise<string[][]> {
  const list = await sql<IndexListRow>`
    SELECT name, "unique", origin FROM pragma_index_list(${tableName})
     ORDER BY name
  `.execute(database);

  const constraints = list.rows.filter((row) => {
    return row.origin === "u";
  });

  const columnLists = await Promise.all(
    constraints.map((row) => {
      return readIndexColumns(database, row.name);
    }),
  );

  return columnLists.sort((left, right) => {
    return left.join(",").localeCompare(right.join(","));
  });
}
