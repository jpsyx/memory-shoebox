/**
 * The id of the `everyone` visibility rule, seeded by migration 0002.
 *
 * A constant rather than a lookup, because it is referenced before anything
 * else exists: it is the default for an upload whose uploader made no
 * visibility decision, and it is the one rule `visibility-rule-sweep` must
 * never delete however many items reference it, which on a fresh Shoebox is
 * none. The API contract short-circuits straight to this id with no lookup at
 * all (`data-models.md` § What that costs, `apis/upload.md`, `apis/items.md`),
 * and it is readable rather than uuid-shaped so that an `items` row inspected
 * in the `sqlite3` shell says what it means.
 *
 * It lives here rather than in the migration that seeds it, so that runtime
 * code never has to reach into a historical migration for a value
 * (`docs/server.md` § Migrations).
 */
export const EVERYONE_VISIBILITY_RULE_ID = "visibility-rule-everyone";
