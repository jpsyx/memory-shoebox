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

/**
 * Every index this schema declared on one table.
 *
 * Filters to `origin = 'c'`, which is "created by CREATE INDEX". The other
 * origins are the implicit indexes SQLite builds for `UNIQUE` and primary key
 * constraints, which are a consequence of the table definition rather than
 * something a migration asked for.
 *
 * Two limitations, deliberate and recorded so they read as choices rather than
 * oversights:
 *
 * - An index on an **expression** rather than a column yields a null column
 *   name from `pragma_index_info`, which this function currently filters out.
 *   That would make such an index look complete (just with fewer columns than
 *   it has) rather than flagging that an expression index exists at all.
 * - A **partial** index (`CREATE INDEX ... WHERE ...`) is indistinguishable
 *   here from a full index on the same column, because the predicate lives in
 *   `sqlite_master.sql` rather than in `pragma_index_info`. This schema has
 *   several partial indexes, so a later task asserts their predicates
 *   separately.
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
