import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { makeQueryCountingDatabaseFromDatabase } from "./makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertBurst,
  insertItem,
  insertItemPerson,
  insertItemTag,
  insertItemView,
  insertMember,
  insertPerson,
  insertRendition,
  insertTag,
  insertUploadSession,
  setBurstCover,
} from "./seedHelpers/seedHelpers.ts";

describe("the archive seeds", () => {
  it("builds a burst with a cover, a tag, a person and a view", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      burst_id: burstId,
      burst_index: 1,
      seq: 1,
    });
    await setBurstCover(database, { burstId, coverItemId: itemId });
    await insertRendition(database, { itemId, purpose: "thumb" });
    const tagId = await insertTag(database, { name: "Beach" });
    await insertItemTag(database, { itemId, tagId });
    const personId = await insertPerson(database, { displayName: "Mateo" });
    await insertItemPerson(database, { itemId, personId });
    await insertItemView(database, { memberId, itemId });

    const rows = await database
      .selectFrom("items")
      .innerJoin("bursts", "bursts.id", "items.burst_id")
      .select(["items.id as itemId", "bursts.cover_item_id as coverItemId"])
      .execute();
    expect(rows).toEqual([{ itemId, coverItemId: itemId }]);

    const tag = await database
      .selectFrom("tags")
      .select(["name", "name_normalized"])
      .executeTakeFirstOrThrow();
    expect(tag).toEqual({ name: "Beach", name_normalized: "beach" });

    const itemPerson = await database
      .selectFrom("item_people")
      .select(["item_id as itemId", "person_id as personId"])
      .where("item_id", "=", itemId)
      .where("person_id", "=", personId)
      .executeTakeFirstOrThrow();
    expect(itemPerson).toEqual({ itemId, personId });

    const itemView = await database
      .selectFrom("item_views")
      .select(["item_id as itemId", "member_id as memberId"])
      .where("item_id", "=", itemId)
      .where("member_id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(itemView).toEqual({ itemId, memberId });

    await database.destroy();
  });

  it("counts every query the handle runs", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const counting = makeQueryCountingDatabaseFromDatabase(database);

    counting.reset();
    await counting.database.selectFrom("items").select("id").execute();
    await counting.database.selectFrom("members").select("id").execute();

    expect(counting.getQueryCount()).toBe(2);
    await database.destroy();
  });
});
