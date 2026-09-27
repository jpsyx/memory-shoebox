import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.ts";
import { migrateToLatest } from "../src/db/migrate.ts";
import {
  readColumns,
  readForeignKeys,
  readIndexes,
  readTableNames,
  readUniqueConstraints,
} from "../src/db/introspect.ts";
import { SCHEMA_MANIFEST } from "../src/db/schemaManifest.ts";
import {
  EXPECTED_FOREIGN_KEYS,
  EXPECTED_INDEXES,
  EXPECTED_UNIQUE_CONSTRAINTS,
} from "../src/db/schemaExpectations.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../src/db/migrations/0002_visibility.ts";
import type { Database } from "../src/db/types.ts";
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
const TABLE_NAMES = Object.keys(SCHEMA_MANIFEST) as ReadonlyArray<
  keyof Database
>;

let database: Kysely<Database>;

beforeEach(async () => {
  database = createDatabase(":memory:");
  await migrateToLatest(database);
});

afterEach(async () => {
  await database.destroy();
});

/** Reads one index's `CREATE INDEX` text out of the catalog. */
async function readIndexSql(indexName: string): Promise<string | null> {
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
async function readPartialIndexNames(): Promise<string[]> {
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

/**
 * Inserts the rows `items` needs before it will accept one of its own, and
 * returns an `items` row with every `NOT NULL` column filled in.
 *
 * The enum tests below want the `CHECK` on `capture_source` to be the thing
 * that rejects a row, so everything else about the row has to be valid.
 */
async function buildValidItem(): Promise<Record<string, string | number>> {
  const now = "2026-09-14T06:41:00.000Z";
  await sql`
    INSERT INTO members (id, email, role, status, notify_on_upload,
                         notify_on_comment, notify_on_reply, notify_on_removal,
                         created_at)
    VALUES ('member-enum', 'enum@example.test', 'uploader', 'active',
            1, 1, 1, 1, ${now})
  `.execute(database);

  return {
    id: "item-enum",
    kind: "photo",
    captured_at: now,
    captured_on: "2026-09-14",
    capture_source: "uploader_set",
    original_captured_at: now,
    seq: 1,
    uploaded_by: "member-enum",
    visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
    width: 4032,
    height: 3024,
    byte_size: 2_486_912,
    content_type: "image/jpeg",
    created_at: now,
  };
}

/**
 * Writes one `items` row with `capture_source` overridden.
 *
 * @returns The number of rows written, which is 1 when the value was accepted.
 */
async function insertItemWithCaptureSource(
  captureSource: string,
): Promise<number> {
  const row = await buildValidItem();
  const result = await database
    .insertInto("items")
    .values({ ...row, capture_source: captureSource } as never)
    .execute();
  return Number(result[0]?.numInsertedOrUpdatedRows ?? 0);
}

/**
 * Writes one `item_capture_date_changes` row with `reason` overridden, having
 * first written the `items` row it hangs off.
 *
 * @returns The number of change rows written.
 */
async function insertCaptureDateChangeWithReason(
  reason: string,
): Promise<number> {
  const row = await buildValidItem();
  await database
    .insertInto("items")
    .values(row as never)
    .execute();
  const now = "2026-09-14T06:41:00.000Z";
  const result = await database
    .insertInto("item_capture_date_changes")
    .values({
      id: "change-enum",
      item_id: "item-enum",
      milestone_id: null,
      previous_captured_at: now,
      previous_capture_date: "2026-09-14",
      previous_capture_source: "exif",
      new_captured_at: "2026-09-15T06:41:00.000Z",
      new_capture_date: "2026-09-15",
      changed_by: "member-enum",
      changed_at: now,
      reason,
    } as never)
    .execute();
  return Number(result[0]?.numInsertedOrUpdatedRows ?? 0);
}

/** Writes the member and the `items` row a removal request hangs off. */
async function insertItemForRemovalRequest(): Promise<void> {
  const row = await buildValidItem();
  await database
    .insertInto("items")
    .values(row as never)
    .execute();
}

/**
 * Builds one `removal_requests` row in the given state against the given item.
 *
 * `resolved_at` and `resolved_by_member_id` track `state`, because
 * `removal_requests_resolves_once` insists an open request carries neither and
 * a settled one carries a timestamp. Everything else is filled in so that the
 * only thing a rejection can be about is `item_id`.
 *
 * @param itemId The photograph the request names, or null for a request whose
 *   photograph is already gone.
 * @param state One of the four states the enum allows.
 * @returns The row, ready to insert.
 */
function buildRemovalRequest(
  itemId: string | null,
  state: string,
): Record<string, string | null> {
  const now = "2026-09-14T06:41:00.000Z";
  const isOpen = state === "open";
  return {
    id: "removal-open-check",
    item_id: itemId,
    requested_by_member_id: "member-enum",
    reason: "That is me in the background.",
    state,
    decline_reason: null,
    created_at: now,
    resolved_at: isOpen ? null : now,
    resolved_by_member_id: isOpen ? null : "member-enum",
    item_uploader_member_id: "member-enum",
    item_captured_at: now,
    item_storage_key: "items/item-enum/original.jpg",
  };
}

/**
 * Writes the item, then one removal request against it.
 *
 * @returns The number of request rows written, which is 1 when accepted.
 */
async function insertRemovalRequest(
  itemId: string | null,
  state: string,
): Promise<number> {
  await insertItemForRemovalRequest();
  const result = await database
    .insertInto("removal_requests")
    .values(buildRemovalRequest(itemId, state) as never)
    .execute();
  return Number(result[0]?.numInsertedOrUpdatedRows ?? 0);
}

/** Settles the one removal request the tests below write, as a deletion. */
async function settleRemovalRequest(): Promise<void> {
  await database
    .updateTable("removal_requests")
    .set({
      state: "deleted",
      resolved_at: "2026-09-14T07:02:00.000Z",
      resolved_by_member_id: "member-enum",
    } as never)
    .where("id", "=", "removal-open-check")
    .execute();
}

describe("the migrated schema", () => {
  it("contains exactly the tables the manifest declares", async () => {
    const actual = await readTableNames(database);
    const declared = Object.keys(SCHEMA_MANIFEST).sort();
    expect(actual).toEqual(declared);
  });

  it("matches the manifest column for column, including nullability, type and default", async () => {
    for (const tableName of TABLE_NAMES) {
      const actual = Object.fromEntries(
        (await readColumns(database, tableName)).map((column) => {
          return [
            column.name,
            {
              isNullable: column.isNullable,
              type: column.type,
              defaultValue: column.defaultValue,
            },
          ];
        }),
      );
      expect(actual, `columns of ${tableName}`).toEqual(
        SCHEMA_MANIFEST[tableName],
      );
    }
  });

  it("applies cleanly a second time", async () => {
    const results = await migrateToLatest(database);
    expect(results).toEqual([]);
  });
});

describe("every relationship", () => {
  it("points where the data model says, with the delete rule it names", async () => {
    for (const tableName of TABLE_NAMES) {
      const actual = await readForeignKeys(database, tableName);
      expect(actual, `foreign keys of ${tableName}`).toEqual(
        EXPECTED_FOREIGN_KEYS[tableName],
      );
    }
  });

  it("is absent from the five tables that reference nothing", async () => {
    const standalone = [
      "members",
      "groups",
      "visibility_rules",
      "email_suppressions",
      "pending_object_deletions",
    ];
    for (const tableName of standalone) {
      const actual = await readForeignKeys(database, tableName);
      expect(actual, `${tableName} should reference nothing`).toEqual([]);
    }
  });

  // Named individually, rather than left to the bulk comparison above, so a
  // failure says which promise broke instead of printing a diff of sixty-one
  // keys.

  it("leaves activity_events.subject_id unconstrained, because an audit log outlives its subjects", async () => {
    const keys = await readForeignKeys(database, "activity_events");
    const columns = keys.map((key) => {
      return key.column;
    });
    expect(columns).not.toContain("subject_id");
  });

  it("sets removal_requests.item_id null, so takedown history survives the takedown", async () => {
    const keys = await readForeignKeys(database, "removal_requests");
    const itemKey = keys.find((key) => {
      return key.column === "item_id";
    });
    expect(itemKey?.onDelete).toBe("SET NULL");
  });

  it("restricts visibility_rule_subjects.group_id, so deleting a group cannot widen access", async () => {
    const keys = await readForeignKeys(database, "visibility_rule_subjects");
    const groupKey = keys.find((key) => {
      return key.column === "group_id";
    });
    expect(groupKey?.onDelete).toBe("RESTRICT");
  });
});

describe("every declared index", () => {
  it("covers the columns the data model names, in the direction and with the uniqueness it names", async () => {
    for (const tableName of TABLE_NAMES) {
      const actual = await readIndexes(database, tableName);
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
      for (const [position, index] of actual.entries()) {
        expect(index, `index ${index.name}`).toEqual(expected[position]);
      }
    }
  });

  it("keeps every table-level UNIQUE the CREATE TABLE declared", async () => {
    // These four are invisible to `readIndexes`, because SQLite builds them as
    // `origin = 'u'` autoindexes rather than as `CREATE INDEX`. They were
    // asserted nowhere until this test existed, which meant `members.email`
    // and `group_members (group_id, member_id)` could both lose their
    // uniqueness and every other schema assertion would still pass.
    for (const tableName of TABLE_NAMES) {
      const actual = await readUniqueConstraints(database, tableName);
      expect(actual, `unique constraints of ${tableName}`).toEqual(
        EXPECTED_UNIQUE_CONSTRAINTS[tableName],
      );
    }
  });

  it("keeps the WHERE clause on every partial index", async () => {
    for (const [indexName, predicate] of EXPECTED_INDEX_PREDICATES) {
      const createSql = await readIndexSql(indexName);
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
    expect(await readPartialIndexNames()).toEqual(listed);
  });
});

describe("the two lookalike capture enums", () => {
  // `items.capture_source` records **how** a capture date was arrived at;
  // `item_capture_date_changes.reason` records **why** one was changed. They
  // look like the same enum and are not: a hand correction lands on the item
  // as `capture_source = 'uploader_set'` and is recorded on the change row as
  // `reason = 'manual'`. Swapping them type-checks green, passes every other
  // test, and two API slices misread the pair once already.
  //
  // The assertions name the constraint in the error, so a row rejected for
  // some other reason (a missing column, a foreign key) cannot pass for the
  // `CHECK` doing its job.

  it("rejects 'manual' on items.capture_source", async () => {
    await expect(insertItemWithCaptureSource("manual")).rejects.toThrow(
      /CHECK constraint failed: capture_source/i,
    );
  });

  it("accepts 'uploader_set' on items.capture_source", async () => {
    await expect(insertItemWithCaptureSource("uploader_set")).resolves.toBe(1);
  });

  it("accepts 'manual' on item_capture_date_changes.reason", async () => {
    await expect(insertCaptureDateChangeWithReason("manual")).resolves.toBe(1);
  });

  it("rejects 'uploader_set' on item_capture_date_changes.reason", async () => {
    await expect(
      insertCaptureDateChangeWithReason("uploader_set"),
    ).rejects.toThrow(/CHECK constraint failed: reason/i);
  });
});

describe("the constraint that an open request names a photograph", () => {
  // `item_id` is `SET NULL`, the one exception in the cascade matrix, so
  // takedown history survives the takedown. The cost is that
  // `removal_requests__one_open_per_asker` stops enforcing anything the moment
  // the column goes null, because SQLite counts distinct nulls as distinct
  // inside a unique index. Migration 0009's `CHECK` closes that by making the
  // null legal only once the request is settled.

  it("rejects an open request with no item", async () => {
    await expect(insertRemovalRequest(null, "open")).rejects.toThrow(
      /CHECK constraint failed: removal_requests_open_has_item/i,
    );
  });

  it("accepts an open request against a real item", async () => {
    await expect(insertRemovalRequest("item-enum", "open")).resolves.toBe(1);
  });

  it("accepts a settled request with no item, which is what SET NULL leaves", async () => {
    await expect(insertRemovalRequest(null, "withdrawn")).resolves.toBe(1);
  });
});

describe("deleting a photograph somebody has asked to have taken down", () => {
  // The end of the argument. The prose contract in `data-models.md` says
  // deleting acts on every open request for that item, and before migration
  // 0009 nothing held anyone to it: the `SET NULL` fired, the request stayed
  // open with a null `item_id`, and the partial unique could no longer see it.

  it("fails while a request is still open, rather than leaving an unpoliceable row", async () => {
    await insertRemovalRequest("item-enum", "open");

    await expect(
      database.deleteFrom("items").where("id", "=", "item-enum").execute(),
    ).rejects.toThrow(
      /CHECK constraint failed: removal_requests_open_has_item/i,
    );
  });

  it("succeeds once the request is settled, and the request outlives the item", async () => {
    await insertRemovalRequest("item-enum", "open");
    await settleRemovalRequest();

    await database.deleteFrom("items").where("id", "=", "item-enum").execute();

    const survivor = await database
      .selectFrom("removal_requests")
      .selectAll()
      .executeTakeFirst();
    expect(survivor?.state).toBe("deleted");
    expect(survivor?.item_id).toBeNull();
    // The snapshot columns are what a settled card still renders.
    expect(survivor?.item_storage_key).toBe("items/item-enum/original.jpg");
  });
});
