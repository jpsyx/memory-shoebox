/**
 * The SQLite schema as Kysely sees it: one property per table, mapping the
 * table name to the shape of a row. Every table added by a migration under
 * `src/db/migrations/` gets a matching entry here, and Kysely then type-checks
 * every query against it.
 *
 * Memory Shoebox has no tables yet. The first feature migration adds the first one.
 */
export type Database = Record<never, never>;
