import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readForeignKeys } from "../../src/db/schemaIntrospectionHelpers.ts";
import { EXPECTED_FOREIGN_KEYS } from "../../src/db/schemaExpectations/schemaExpectations.ts";
import { TABLE_NAMES } from "./schema.constants.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Kysely } from "kysely";

let database: Kysely<Database>;

beforeEach(async () => {
  database = createDatabase(":memory:");
  await migrateToLatest(database);
});

afterEach(async () => {
  await database.destroy();
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
