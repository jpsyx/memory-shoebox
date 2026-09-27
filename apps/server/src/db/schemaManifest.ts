import type { Database } from "./types.ts";

/** Each entry lists the columns of the table it is keyed by, and no others. */
type SchemaManifestShape = {
  readonly [TableName in keyof Database]: ReadonlyArray<
    keyof Database[TableName] & string
  >;
};

/**
 * Every table and column, at runtime.
 *
 * `Database` in `types.ts` is the same information as a type, and types are
 * erased before any test can read them. This is the runtime copy, and the two
 * assertions below make it impossible for the copies to disagree: adding a
 * table or a column to one and not the other fails `pnpm type-check`, and the
 * schema test then compares this manifest against the database the migrations
 * actually built.
 *
 * Keep the column lists in the order `data-models.md` gives them. The test
 * sorts before comparing, so the order is for the reader.
 */
export const SCHEMA_MANIFEST = {} as const satisfies SchemaManifestShape;

/**
 * Compile-time guard 1: every table in `Database` appears in the manifest.
 */
type MissingTables = Exclude<keyof Database, keyof typeof SCHEMA_MANIFEST>;

/**
 * Compile-time guard 2: every column of every table appears in its entry.
 *
 * `satisfies` above already rejects a column that does not exist. This is the
 * other direction, which `satisfies` does not check: a column that exists and
 * was left out.
 */
type MissingColumns = {
  [TableName in keyof Database]: Exclude<
    keyof Database[TableName] & string,
    (typeof SCHEMA_MANIFEST)[TableName][number]
  >;
}[keyof Database];

/**
 * Both guards read as `never` when the manifest is complete. When one is not,
 * the error names the table or column that was forgotten.
 *
 * **The square brackets are load-bearing and must not be "simplified" away.**
 * A naked `T extends never` distributes over its argument, and `never` is the
 * empty union, so `MissingTables extends never ? true : never` evaluates to
 * `never` even when `MissingTables` is `never`. That makes the assertion fail
 * to compile in exactly the case it is supposed to accept. Wrapping both sides
 * in a tuple suppresses distribution and compares the types directly.
 */
const _assertNoMissingTables: [MissingTables] extends [never] ? true : never =
  true;
const _assertNoMissingColumns: [MissingColumns] extends [never] ? true : never =
  true;

// `noUnusedLocals` flags a declared-but-unreferenced local regardless of the
// underscore prefix (that convention is ours, not the compiler's), so both
// guards are referenced here purely to keep them counted as used. The `void`
// discards the value; the assertion is already complete once each constant
// type-checks against `true`.
void _assertNoMissingTables;
void _assertNoMissingColumns;
