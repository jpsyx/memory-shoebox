import { SCHEMA_MANIFEST } from "../../src/db/schemaManifest/schemaManifest.ts";
import type { Database } from "../../src/db/types/db.types.ts";

/**
 * The tables to walk, typed as `Database`'s own keys.
 *
 * `SCHEMA_MANIFEST` is a full mapped type over `keyof Database`, so its keys
 * are exactly the table names and the cast asserts nothing the compiler has
 * not already checked. Having them typed is what lets the loops below index
 * `EXPECTED_FOREIGN_KEYS` and `EXPECTED_INDEXES` directly rather than falling
 * back to `?? []`, which used to turn a stale table name into a dead entry
 * that asserted nothing.
 */
export const TABLE_NAMES = Object.keys(SCHEMA_MANIFEST) as ReadonlyArray<
  keyof Database
>;
