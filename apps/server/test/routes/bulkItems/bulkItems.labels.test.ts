import { describe, expect, it } from "vitest";
import {
  insertItemTag,
  insertTag,
  insertItemPerson,
  insertPerson,
  insertMember,
  insertMilestone,
  insertItemMilestone,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { makeBulkTestContext } from "./bulkItems.helpers.ts";

async function _fillItemLabels(options: {
  database: Awaited<ReturnType<typeof makeBulkTestContext>>["database"];
  itemId: string;
  action: string;
}): Promise<void> {
  const { database, itemId, action } = options;
  const labelCount = action === "tags" ? 50 : 30;
  await Promise.all(
    Array.from({ length: labelCount }, async (_unused, index) => {
      if (action === "tags") {
        const tagId = await insertTag(database, { name: `Tag ${index}` });
        await insertItemTag(database, { itemId: itemId, tagId });
      } else {
        const personId = await insertPerson(database, {
          displayName: `Person ${index}`,
        });
        await insertItemPerson(database, { itemId: itemId, personId });
      }
    }),
  );
}

describe("POST /api/items/bulk-edit labels", () => {
  it("adds normalized tags while preserving previous labels and provenance without opening items", async () => {
    const { database, post, itemIds, memberId } = await makeBulkTestContext();
    const otherId = await insertMember(database);
    const tagId = await insertTag(database, { name: "Beach" });
    await insertItemTag(database, {
      itemId: itemIds[0]!,
      tagId,
      tagged_by: otherId,
    });
    const before = await database.selectFrom("item_tags").selectAll().execute();
    const response = await post({
      action: "tags",
      itemIds,
      tags: ["beach", " Holiday ", "holiday"],
    });
    expect(response.statusCode).toBe(204);
    const joins = await database.selectFrom("item_tags").selectAll().execute();
    expect(joins).toHaveLength(4);
    expect(joins).toEqual(expect.arrayContaining(before));
    expect(
      joins
        .filter((join) => {
          return join.id !== before[0]!.id;
        })
        .every((join) => {
          return join.tagged_by === memberId;
        }),
    ).toBe(true);
    expect(
      await database
        .selectFrom("tags")
        .select("name")
        .orderBy("name")
        .execute(),
    ).toEqual([{ name: "Beach" }, { name: "Holiday" }]);
    expect(
      await database.selectFrom("item_views").selectAll().execute(),
    ).toEqual([]);
  });

  it("creates each newly typed person once for the batch and keeps existing people provenance", async () => {
    const { database, post, itemIds } = await makeBulkTestContext();
    const personId = await insertPerson(database, { displayName: "Alex" });
    const keptPersonId = await insertPerson(database, { displayName: "Rosa" });
    await insertItemPerson(database, { itemId: itemIds[0]!, personId });
    await insertItemPerson(database, {
      itemId: itemIds[0]!,
      personId: keptPersonId,
    });
    const before = await database
      .selectFrom("item_people")
      .selectAll()
      .execute();
    expect(
      (
        await post({
          action: "people",
          itemIds,
          people: [{ personId }, { displayName: "Sam" }],
        })
      ).statusCode,
    ).toBe(204);
    const joins = await database
      .selectFrom("item_people")
      .selectAll()
      .execute();
    expect(joins).toHaveLength(5);
    expect(joins).toEqual(expect.arrayContaining(before));
    const created = await database
      .selectFrom("people")
      .selectAll()
      .where("display_name", "=", "Sam")
      .execute();
    expect(created).toHaveLength(1);
    expect(
      joins.filter((join) => {
        return join.person_id === created[0]!.id;
      }),
    ).toHaveLength(2);
    expect(created[0]!.member_id).toBeNull();
  });

  it.each(["tags", "people"])(
    "rolls back every %s write when a later item's combined label set exceeds its limit",
    async (action) => {
      const { database, post, itemIds } = await makeBulkTestContext();
      await _fillItemLabels({ database, itemId: itemIds[1]!, action });
      const response = await post({
        action,
        itemIds,
        ...(action === "tags"
          ? { tags: ["New"] }
          : { people: [{ displayName: "New" }] }),
      });
      expect(response.statusCode).toBe(400);
      expect(
        await database
          .selectFrom("item_tags")
          .selectAll()
          .where("item_id", "=", itemIds[0]!)
          .execute(),
      ).toEqual([]);
      expect(
        await database
          .selectFrom("item_people")
          .selectAll()
          .where("item_id", "=", itemIds[0]!)
          .execute(),
      ).toEqual([]);
      expect(
        await database
          .selectFrom("tags")
          .selectAll()
          .where("name", "=", "New")
          .execute(),
      ).toEqual([]);
      expect(
        await database
          .selectFrom("people")
          .selectAll()
          .where("display_name", "=", "New")
          .execute(),
      ).toEqual([]);
    },
  );

  it("attaches occasions without changing previous joins, acknowledgements or capture dates", async () => {
    const { database, post, itemIds } = await makeBulkTestContext();
    const milestoneId = await insertMilestone(database, {
      name: "Holiday",
      startsOn: "2026-01-01",
    });
    const otherMilestoneId = await insertMilestone(database, {
      name: "Birthday",
      startsOn: "2026-09-27",
    });
    await insertItemMilestone(database, {
      itemId: itemIds[0]!,
      milestoneId,
      span_mismatch_acknowledged_at: "2026-09-27T10:00:00.000Z",
    });
    await insertItemMilestone(database, {
      itemId: itemIds[1]!,
      milestoneId: otherMilestoneId,
    });
    const before = await database
      .selectFrom("item_milestones")
      .selectAll()
      .execute();
    expect(
      (await post({ action: "milestone", itemIds, milestoneId })).statusCode,
    ).toBe(204);
    const joins = await database
      .selectFrom("item_milestones")
      .selectAll()
      .execute();
    expect(joins).toHaveLength(3);
    expect(joins).toEqual(expect.arrayContaining(before));
    expect(
      joins.find((join) => {
        return join.item_id === itemIds[1] && join.milestone_id === milestoneId;
      })?.span_mismatch_acknowledged_at,
    ).toBeNull();
    expect(
      await database.selectFrom("items").select("captured_on").execute(),
    ).toEqual([{ captured_on: "2026-09-27" }, { captured_on: "2026-09-27" }]);
  });
});
