import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  readIndexes,
  readUniqueConstraints,
} from "../../src/db/schemaIntrospectionHelpers.ts";
import {
  EXPECTED_INDEXES,
  EXPECTED_UNIQUE_CONSTRAINTS,
} from "../../src/db/schemaExpectations/schemaExpectations.ts";
import { TABLE_NAMES } from "./schema.constants.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Kysely } from "kysely";

/**
 * A partial index and a full index on the same columns are indistinguishable
 * to `readIndexes`, because the predicate lives in `sqlite_master.sql` rather
 * than in `pragma_index_xinfo`. Several indexes in this schema are load-bearing
 * precisely because they are partial: drop the `WHERE` from
 * `removal_requests__one_open_per_asker` and "Ask again" stops working; drop
 * it from `settings__one_instance_value` and two instance rows for one key
 * become legal. So the predicate is asserted separately, as a fragment that
 * has to appear in the `CREATE INDEX` text.
 *
 * The last four entries are the exception to that rule and say so: they are
 * partial for size, not for correctness. Losing one of those `WHERE` clauses
 * leaves the index correct and makes it several times the size of the rows it
 * serves, which is worth catching even though nothing breaks. Listing them
 * makes this a complete record of every partial index in the schema, so an
 * index missing from it is an index that is not partial at all.
 *
 * Fragments are lower-cased before comparison, since the builder's casing is
 * not something this test should pin.
 */
const EXPECTED_INDEX_PREDICATES: ReadonlyArray<readonly [string, string]> = [
  // One open request per asker per photograph, but "Ask again" after a
  // decline has to stay possible, which a full unique would forbid.
  ["removal_requests__one_open_per_asker", `where "state" = 'open'`],
  // Only rows that got as far as an object, or as far as a hash.
  ["upload_files__storage_key", `where "storage_key" is not null`],
  ["upload_files__session_content_hash", `where "content_hash" is not null`],
  // Surface 17 counts what each member opened, which is not what they
  // scrolled past.
  ["item_views__opened_by_item", `where "first_opened_at" is not null`],
  ["item_views__opened_by_member", `where "first_opened_at" is not null`],
  // SQLite treats nulls as distinct in a unique index, so a plain
  // `UNIQUE (scope, scope_id, key)` would allow two instance rows for one key.
  ["settings__one_instance_value", `where "scope" = 'instance'`],
  ["settings__one_member_value", `where "scope" = 'member'`],
  // The unique that stops two person records claiming one account, without
  // stopping many people from having no account at all.
  ["people_member", `where "member_id" is not null`],
  // The pair that rejects the same subject twice on one rule. Without the
  // predicates they reject nothing at all, because one id column is always
  // null and SQLite counts distinct nulls as distinct.
  ["visibility_rule_subjects_member", `where "member_id" is not null`],
  ["visibility_rule_subjects_group", `where "group_id" is not null`],
  // The four that are partial for size rather than for correctness. Each
  // indexes a child column whose parent can be deleted, and in each the null
  // rows are exactly the ones the index would never have anything to find in:
  // a request whose photograph is gone, a file that never became an item, a
  // log row whose device has expired, and every manual and timezone-change
  // capture-date row, which is most of them.
  ["removal_requests__by_item", `where "item_id" is not null`],
  ["upload_files__by_item", `where "item_id" is not null`],
  ["activity_events__by_device", `where "device_id" is not null`],
  ["item_capture_date_changes_milestone", `where "milestone_id" is not null`],
];

let database: Kysely<Database>;

beforeEach(async () => {
  database = createDatabase(":memory:");
  await migrateToLatest(database);
});

afterEach(async () => {
  await database.destroy();
});

/** Reads one index's `CREATE INDEX` text out of the catalog. */
async function _readIndexSql(indexName: string): Promise<string | null> {
  const result = await sql<{ sql: string | null }>`
    SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ${indexName}
  `.execute(database);
  return result.rows[0]?.sql ?? null;
}

/**
 * Every index in the database whose `CREATE INDEX` carries a `WHERE`, sorted.
 *
 * Read from the catalog rather than from a list, so it answers what the
 * database actually built. An autoindex has a null `sql` and so cannot appear,
 * which is right: a table-level `UNIQUE` cannot be partial.
 */
async function _readPartialIndexNames(): Promise<string[]> {
  const result = await sql<{ name: string; sql: string | null }>`
    SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name
  `.execute(database);
  return result.rows
    .filter((row) => {
      return (row.sql ?? "").toLowerCase().includes(" where ");
    })
    .map((row) => {
      return row.name;
    });
}

describe("every declared index", () => {
  it("covers the columns the data model names, in the direction and with the uniqueness it names", async () => {
    for (const tableName of TABLE_NAMES) {
      const actual = await readIndexes({ database, tableName });
      const expected = EXPECTED_INDEXES[tableName];

      // The names first, so an index that was dropped or invented is reported
      // as exactly that.
      expect(
        actual.map((index) => {
          return index.name;
        }),
        `indexes of ${tableName}`,
      ).toEqual(
        expected.map((index) => {
          return index.name;
        }),
      );

      // Then each index alone, so a failure names the index that broke rather
      // than printing a diff of every index on the table and leaving the
      // reader to find the changed line in it. A single missing `DESC` is a
      // two-character difference inside one of six nested objects.
      actual.forEach((index, position) => {
        expect(index, `index ${index.name}`).toEqual(expected[position]);
      });
    }
  });

  it("keeps every table-level UNIQUE the CREATE TABLE declared", async () => {
    // These four are invisible to `readIndexes`, because SQLite builds them as
    // `origin = 'u'` autoindexes rather than as `CREATE INDEX`. They were
    // asserted nowhere until this test existed, which meant `members.email`
    // and `group_members (group_id, member_id)` could both lose their
    // uniqueness and every other schema assertion would still pass.
    for (const tableName of TABLE_NAMES) {
      const actual = await readUniqueConstraints({ database, tableName });
      expect(actual, `unique constraints of ${tableName}`).toEqual(
        EXPECTED_UNIQUE_CONSTRAINTS[tableName],
      );
    }
  });

  it("keeps the WHERE clause on every partial index", async () => {
    for (const [indexName, predicate] of EXPECTED_INDEX_PREDICATES) {
      const createSql = await _readIndexSql(indexName);
      expect(createSql, `${indexName} should exist`).not.toBeNull();
      expect(
        createSql?.toLowerCase(),
        `${indexName} should stay partial`,
      ).toContain(predicate.toLowerCase());
    }
  });

  it("has no partial index the list above does not name", async () => {
    // What makes the list a record rather than a sample. An index that grows
    // a `WHERE` without an entry here is a predicate nobody wrote a reason
    // for, and a listed index that quietly stopped being partial is caught by
    // the test above.
    const listed = EXPECTED_INDEX_PREDICATES.map(([indexName]) => {
      return indexName;
    }).sort();
    expect(await _readPartialIndexNames()).toEqual(listed);
  });
});
