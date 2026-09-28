import type SQLite from "better-sqlite3";
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

/**
 * Registers `create_id()` as a SQLite user-defined function on `sqlite`,
 * backed by {@link createId}.
 *
 * **The first-sign-in seed is why this exists.** Decision 3 seeds one
 * `item_views` row per existing item for a brand-new member, and `auth.md`
 * requires it to be one `INSERT ... SELECT`: minting a uuid per row in
 * application code would turn one statement into roughly 17,000 round trips.
 * `item_views.id` is a uuid column with no default, so SQL itself has to be
 * able to mint one, and `create_id()` is `createId()` itself, so there is
 * still only one generator.
 *
 * Registered as non-deterministic so SQLite calls it once per row instead of
 * caching one result for the whole statement.
 *
 * @param sqlite The better-sqlite3 database to register the function on.
 */
export function registerCreateId(sqlite: SQLite.Database): void {
  sqlite.function("create_id", { deterministic: false }, () => {
    return createId();
  });
}
