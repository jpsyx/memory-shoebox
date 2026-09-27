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
  readonly pk: number;
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
 * Every column of one table, in declaration order.
 *
 * A primary key column is reported as nullable by `PRAGMA table_info` unless
 * it was declared `NOT NULL`, because SQLite permits a null in a non-INTEGER
 * primary key. Every id here is `TEXT PRIMARY KEY`, so treat `pk` as
 * not-nullable rather than trusting `notnull` alone.
 */
export async function readColumns(
  database: Kysely<Database>,
  tableName: string,
): Promise<ColumnInfo[]> {
  const result = await sql<TableInfoRow>`
    SELECT name, "notnull", pk FROM pragma_table_info(${tableName})
  `.execute(database);
  return result.rows.map((row) => {
    return { name: row.name, isNullable: row.notnull === 0 && row.pk === 0 };
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
