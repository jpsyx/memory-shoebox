import type { Migration } from "kysely";

/**
 * Every migration, keyed by the name recorded in the migration table.
 *
 * Migrations are registered explicitly rather than discovered from disk: the
 * server runs TypeScript directly, so a filesystem-scanning provider would
 * behave differently in development and in the production container.
 *
 * To add one, create `NNNN_description.ts` beside this file exporting a
 * `Migration`, then add it here. Keys are ordered lexicographically, so keep
 * the zero-padded numeric prefix. Never edit or reorder a migration that has
 * already shipped: deployed databases have recorded it as applied.
 */
export const migrations: Record<string, Migration> = {};
