import type { Database } from "../types/db.types.ts";
import { CATALOG_MANIFEST } from "./catalog.ts";
import { IDENTITY_AND_ACCESS_MANIFEST } from "./identityAndAccess.ts";
import { MODERATION_MANIFEST } from "./moderation.ts";
import { OPERATIONS_MANIFEST } from "./operations.ts";
import { UPLOAD_MANIFEST } from "./upload.ts";

/**
 * Every table, every column, and what SQLite actually enforces about it:
 * nullability, declared type, and default expression.
 *
 * `Database` in `types.ts` is the nullability half of this as a type, and
 * types are erased before any test can read them. This is the runtime copy.
 * The shape below ties the two together at compile time and the schema test
 * ties this to the database the migrations actually built, so all three have
 * to agree.
 *
 * `isNullable: false` means the column is `NOT NULL`. `type` is what the
 * migration declared, verbatim, which for this schema is always `TEXT`,
 * `INTEGER` or `REAL`. `defaultValue` is the `DEFAULT` expression as SQLite
 * reports it, so a string default keeps its quotes (`"'viewer'"`) and a
 * numeric one arrives as a string (`"3"`); null means the column declares no
 * default at all.
 *
 * **Type and default are here because nullability alone catches neither of
 * the mistakes they make possible.** SQLite's affinity rules mean
 * `items.byte_size` retyped from `INTEGER` to `TEXT` still stores every
 * number the application writes and every query still returns rows;
 * `comments.at_seconds` retyped from `REAL` to `TEXT` silently turns the
 * scrubber's fractional offsets into strings that sort lexicographically. A
 * dropped `DEFAULT 3` on `sign_in_codes.max_attempts` or a flipped
 * `DEFAULT 1` on `members.notify_on_upload` changes what a row means without
 * changing whether any row is legal. None of those fails a test that only
 * reads `notnull`.
 *
 * Transcribed against `data-models.md`, which gives an explicit
 * type-and-default table for `members`, `sign_in_codes`, `sessions`,
 * `invitations` and `items` and describes the rest in prose. Every column the
 * document types agrees with what the migrations built. The counter defaults
 * the document does not state (`bursts.is_manual`, `item_views.open_count`,
 * `upload_sessions.file_count` and `total_bytes`,
 * `upload_files.attempt_count`, `outbound_emails.attempts`,
 * `pending_object_deletions.attempts`, all `0`) record what the migrations
 * chose, so changing one is a decision rather than a drift.
 *
 * Keep the columns in the order `data-models.md` gives them; the test compares
 * maps, so the order is for the reader.
 *
 * Composed from one file per table group, split the way the migrations are.
 * Each leaf carries its own `satisfies Pick<SchemaManifestShape, ...>` so a
 * column mistake still fails at the column rather than as one error here.
 */
export const SCHEMA_MANIFEST = {
  ...IDENTITY_AND_ACCESS_MANIFEST,
  ...CATALOG_MANIFEST,
  ...MODERATION_MANIFEST,
  ...UPLOAD_MANIFEST,
  ...OPERATIONS_MANIFEST,
} as const satisfies SchemaManifestShape;

/**
 * Every table in `Database`, mapping every one of its columns to what the
 * manifest has to record about it.
 *
 * This single mapped type does all the checking, and it is worth understanding
 * why before changing it. Because it is a **full** mapped type rather than a
 * partial one, `satisfies` rejects three different mistakes on its own:
 *
 * | Mistake                                 | What the compiler says                             |
 * | ---------------------------------------- | -------------------------------------------------- |
 * | A table left out of the manifest        | `TS1360`, naming the table                         |
 * | A column left out of a table's entry    | `TS2741`, naming the column                        |
 * | Nullability disagreeing with `Database` | `TS2322: 'false' is not assignable to type 'true'` |
 *
 * **`isNullable` is the load-bearing member and its type is the whole point.**
 * It is not `boolean`: it resolves per column to the literal `true` or `false`
 * that `Database` implies, so the manifest cannot disagree with the Kysely
 * type without failing to compile. Widening it to `boolean` would leave this
 * file asserting only that somebody wrote a boolean, which is the difference
 * between a tie and a formality. `type` and `defaultValue` ride alongside as
 * ordinary values, because `Database` says nothing about either: SQLite's
 * `INTEGER` and `REAL` both surface as `number`, and a default is invisible to
 * a row type. They are tied to the live database by the schema test instead.
 *
 * An earlier draft listed columns as a string array and needed two hand-built
 * `Exclude` guards to catch the second case, because an array cannot express
 * completeness. Those guards then had to be referenced to survive
 * `noUnusedLocals`, and deleting a guard together with its reference removed
 * the check silently. Mapping the columns as object keys makes all of that
 * unnecessary: there is nothing to leave unused and nothing to delete.
 */
export type SchemaManifestShape = {
  readonly [TableName in keyof Database]: {
    readonly [ColumnName in keyof Database[TableName] & string]: {
      readonly isNullable: null extends Database[TableName][ColumnName]
        ? true
        : false;
      readonly type: string;
      readonly defaultValue: string | null;
    };
  };
};
