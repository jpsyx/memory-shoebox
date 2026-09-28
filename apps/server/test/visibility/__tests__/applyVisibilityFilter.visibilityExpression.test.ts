import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { Viewer } from "../../../src/http/requestContextHelpers.ts";
import { visibilityExpression } from "../../../src/visibility/applyVisibilityFilter.ts";
import { createId } from "../../../src/db/createId.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { makeViewerFromMemberId } from "./applyVisibilityFilterTestHelpers.ts";

/**
 * The people directory's query, counting only what the viewer may see.
 *
 * This is the shape `timeline.md` § Performance prescribes, predicate in the
 * `ON` clause and `count(items.id)` rather than `count(*)`.
 */
async function _getDirectoryRowsFromViewer(options: {
  database: Kysely<Database>;
  viewer: Viewer;
}): Promise<Array<{ displayName: string; itemCount: number }>> {
  const { database, viewer } = options;
  const rows = await database
    .selectFrom("people")
    .leftJoin("item_people", "item_people.person_id", "people.id")
    .leftJoin("items", (join) => {
      return join.onRef("items.id", "=", "item_people.item_id").on((eb) => {
        return visibilityExpression({ eb, viewer });
      });
    })
    .select((eb) => {
      return ["people.display_name", eb.fn.count("items.id").as("item_count")];
    })
    .groupBy("people.id")
    .execute();
  return rows.map((row) => {
    return {
      displayName: row.display_name,
      itemCount: Number(row.item_count),
    };
  });
}

/** Seeds one person tagged in one photograph a plain viewer may not see. */
async function _seedPersonWithOneInvisibleItem(
  database: Kysely<Database>,
): Promise<void> {
  const uploaderId = await insertMember(database, {
    email: "papa@example.com",
  });
  const ruleId = await insertVisibilityRule(database, { mode: "only" });
  await insertVisibilityRuleSubject(database, {
    ruleId,
    memberId: uploaderId,
  });
  const itemId = await insertItem(database, {
    uploadedBy: uploaderId,
    visibility_rule_id: ruleId,
  });

  const personId = createId();
  await database
    .insertInto("people")
    .values({
      id: personId,
      display_name: "Sofía",
      member_id: null,
      preferred_face_item_id: null,
      created_by: null,
      created_at: NOW,
    })
    .execute();
  await database
    .insertInto("item_people")
    .values({
      id: createId(),
      item_id: itemId,
      person_id: personId,
      tagged_by: null,
      tagged_at: NOW,
    })
    .execute();
}

describe("visibilityExpression in a left join's ON clause", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("keeps a person whose every photograph is invisible to the viewer", async () => {
    // The single most likely bug in the people directory (`timeline.md`
    // § Performance): in the `WHERE` this predicate turns the left join into
    // an inner one and everybody with nothing visible disappears.
    await _seedPersonWithOneInvisibleItem(database);
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });

    const viewer = await makeViewerFromMemberId({
      database,
      memberId: viewerId,
    });
    expect(await _getDirectoryRowsFromViewer({ database, viewer })).toEqual([
      { displayName: "Sofía", itemCount: 0 },
    ]);
  });

  it("counts that photograph for an admin, whose expression is a literal", async () => {
    await _seedPersonWithOneInvisibleItem(database);
    const adminId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
    });

    const viewer = await makeViewerFromMemberId({
      database,
      memberId: adminId,
      role: "admin",
    });
    expect(await _getDirectoryRowsFromViewer({ database, viewer })).toEqual([
      { displayName: "Sofía", itemCount: 1 },
    ]);
  });
});
