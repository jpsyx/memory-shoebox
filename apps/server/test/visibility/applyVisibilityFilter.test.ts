import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import {
  applyVisibilityFilter,
  visibilityExpression,
} from "../../src/visibility/applyVisibilityFilter.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import { getVisibleRuleIdsFromMemberId } from "../../src/visibility/getVisibleRuleIdsFromMemberId.ts";
import { createId } from "../../src/db/createId.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../helpers/seedHelpers.ts";

/** A viewer built from the real expansion, which is what a request holds. */
async function _makeViewerFromMemberId(options: {
  database: Kysely<Database>;
  memberId: string;
  role?: Viewer["role"];
}): Promise<Viewer> {
  const role = options.role ?? "viewer";
  return {
    memberId: options.memberId,
    sessionId: createId(),
    role,
    isAdmin: role === "admin",
    visibleRuleIds: await getVisibleRuleIdsFromMemberId({
      database: options.database,
      memberId: options.memberId,
    }),
  };
}

/** The ids a viewer can see, through the filter and nothing else. */
async function _getVisibleItemIdsFromViewer(options: {
  database: Kysely<Database>;
  viewer: Viewer;
}): Promise<string[]> {
  const rows = await applyVisibilityFilter({
    query: options.database.selectFrom("items").select("items.id"),
    viewer: options.viewer,
  }).execute();
  return rows.map((row) => {
    return row.id;
  });
}

describe("applyVisibilityFilter", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("shows an everyone item to a viewer who uploaded nothing", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const itemId = await insertItem(database, { uploadedBy: uploaderId });

    const viewer = await _makeViewerFromMemberId({
      database,
      memberId: viewerId,
    });
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual([
      itemId,
    ]);
  });

  it("hides an item whose rule excludes the viewer", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId,
      memberId: uploaderId,
    });
    await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: ruleId,
    });

    const viewer = await _makeViewerFromMemberId({
      database,
      memberId: viewerId,
    });
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual(
      [],
    );
  });

  it("shows an uploader their own item under a rule that excludes them", async () => {
    // Decision 7: a rule that was correct in September becomes
    // self-excluding when an admin adds its author to Cousins in October, and
    // no write-time check can catch that.
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const otherId = await insertMember(database, { email: "ines@example.com" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId: otherId });
    const itemId = await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: ruleId,
    });

    const viewer = await _makeViewerFromMemberId({
      database,
      memberId: uploaderId,
    });
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual([
      itemId,
    ]);
  });

  it("shows an admin everything, with no clause in the query at all", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const adminId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
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

    const viewer = await _makeViewerFromMemberId({
      database,
      memberId: adminId,
      role: "admin",
    });
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual([
      itemId,
    ]);

    // Identity, not the absence of a string: a query carrying `where 1 = 1`
    // would also hold no `visibility_rule_id`, and this is the assertion that
    // the admin's query comes back untouched.
    const query = database.selectFrom("items").select("items.id");
    expect(applyVisibilityFilter({ query, viewer })).toBe(query);
  });

  it("never lets a people tag be a key to a photograph", async () => {
    // `item_people` must not appear in any visibility expression
    // (Decision 7). A photograph restricted to admins and people-tagged for a
    // viewer is invisible to that viewer.
    const adminId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId: adminId });
    const itemId = await insertItem(database, {
      uploadedBy: adminId,
      visibility_rule_id: ruleId,
    });

    const personId = createId();
    await database
      .insertInto("people")
      .values({
        id: personId,
        display_name: "Rosa",
        member_id: viewerId,
        preferred_face_item_id: null,
        created_by: null,
        created_at: "2026-09-27T10:00:00.000Z",
      })
      .execute();
    await database
      .insertInto("item_people")
      .values({
        id: createId(),
        item_id: itemId,
        person_id: personId,
        tagged_by: null,
        tagged_at: "2026-09-27T10:00:00.000Z",
      })
      .execute();

    const viewer = await _makeViewerFromMemberId({
      database,
      memberId: viewerId,
    });
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual(
      [],
    );
  });

  it("shows a viewer with an empty rule set only their own uploads", async () => {
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const itemId = await insertItem(database, { uploadedBy: viewerId });

    const viewer: Viewer = {
      memberId: viewerId,
      sessionId: createId(),
      role: "viewer",
      isAdmin: false,
      visibleRuleIds: [],
    };
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual([
      itemId,
    ]);
  });

  it("parenthesises its predicate against a where applied before it", () => {
    // Without the grouping, a caller's own filter would bind to one half of
    // the `or` and the other half would widen the page back out.
    const viewer: Viewer = {
      memberId: createId(),
      sessionId: createId(),
      role: "viewer",
      isAdmin: false,
      visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
    };
    const compiled = applyVisibilityFilter({
      query: database
        .selectFrom("items")
        .select("items.id")
        .where("items.kind", "=", "video"),
      viewer,
    }).compile();

    expect(compiled.sql).toContain(
      'and ("items"."visibility_rule_id" in (?) or "items"."uploaded_by" = ?)',
    );
  });

  it("parenthesises its predicate against a where applied after it", () => {
    const viewer: Viewer = {
      memberId: createId(),
      sessionId: createId(),
      role: "viewer",
      isAdmin: false,
      visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
    };
    const compiled = applyVisibilityFilter({
      query: database.selectFrom("items").select("items.id"),
      viewer,
    })
      .where("items.kind", "=", "video")
      .compile();

    expect(compiled.sql).toContain(
      '("items"."visibility_rule_id" in (?) or "items"."uploaded_by" = ?) and "items"."kind" = ?',
    );
  });

  it("does not show an everyone item to a viewer whose set is empty", async () => {
    const uploaderId = await insertMember(database, {
      email: "papa@example.com",
    });
    const viewerId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertItem(database, {
      uploadedBy: uploaderId,
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
    });

    const viewer: Viewer = {
      memberId: viewerId,
      sessionId: createId(),
      role: "viewer",
      isAdmin: false,
      visibleRuleIds: [],
    };
    expect(await _getVisibleItemIdsFromViewer({ database, viewer })).toEqual(
      [],
    );
  });
});

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

    const viewer = await _makeViewerFromMemberId({
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

    const viewer = await _makeViewerFromMemberId({
      database,
      memberId: adminId,
      role: "admin",
    });
    expect(await _getDirectoryRowsFromViewer({ database, viewer })).toEqual([
      { displayName: "Sofía", itemCount: 1 },
    ]);
  });
});
