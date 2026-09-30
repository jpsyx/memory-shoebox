import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { setItemTags } from "../../src/items/setItemTags.ts";
import {
  insertItem,
  insertItemTag,
  insertMember,
  insertTag,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const readTagNames = async (database: Kysely<Database>, itemId: string) => {
  const rows = await database
    .selectFrom("item_tags")
    .innerJoin("tags", "tags.id", "item_tags.tag_id")
    .select(["tags.name as name", "item_tags.tagged_at as taggedAt"])
    .where("item_tags.item_id", "=", itemId)
    .execute();
  return rows;
};

describe("setItemTags", () => {
  it("creates the tags it has never seen, with the name as typed", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    await setItemTags({
      transaction: database,
      itemId,
      memberId,
      names: ["Hospital", "the beach"],
      now: NOW,
    });

    expect(
      (await readTagNames(database, itemId))
        .map((row) => {
          return row.name;
        })
        .sort(),
    ).toEqual(["Hospital", "the beach"]);
    await database.destroy();
  });

  it("matches on the normalised name and keeps the stored spelling", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const existingId = await insertTag(database, { name: "Hospital" });

    await setItemTags({
      transaction: database,
      itemId,
      memberId,
      names: ["  hospital  "],
      now: NOW,
    });

    const tags = await database.selectFrom("tags").selectAll().execute();
    expect(tags).toHaveLength(1);
    expect(tags[0]?.id).toBe(existingId);
    // Typing "hospital" does not rename it under the other two hundred items
    // carrying it.
    expect(tags[0]?.name).toBe("Hospital");
    await database.destroy();
  });

  it("deduplicates the request against the normalised form", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    await setItemTags({
      transaction: database,
      itemId,
      memberId,
      names: ["Beach", "beach", "BEACH"],
      now: NOW,
    });

    expect(await readTagNames(database, itemId)).toHaveLength(1);
    await database.destroy();
  });

  it("diffs rather than replacing, so untouched provenance survives", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const keptId = await insertTag(database, { name: "Hospital" });
    const droppedId = await insertTag(database, { name: "Beach" });
    await insertItemTag(database, { itemId, tagId: keptId });
    await insertItemTag(database, { itemId, tagId: droppedId });
    const later = shiftMinutes({ instant: NOW, minutes: 10 });

    await setItemTags({
      transaction: database,
      itemId,
      memberId,
      names: ["Hospital", "Mateo"],
      now: later,
    });

    const rows = await readTagNames(database, itemId);
    expect(
      rows
        .map((row) => {
          return row.name;
        })
        .sort(),
    ).toEqual(["Hospital", "Mateo"]);
    expect(
      rows.find((row) => {
        return row.name === "Hospital";
      })?.taggedAt,
    ).toBe(NOW);
    await database.destroy();
  });

  it("never deletes a tag row, only the join", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const tagId = await insertTag(database, { name: "Beach" });
    await insertItemTag(database, { itemId, tagId });

    await setItemTags({
      transaction: database,
      itemId,
      memberId,
      names: [],
      now: NOW,
    });

    // A tag on no items is a directory entry with a count of zero, which is a
    // state the timeline renders.
    expect(
      await database.selectFrom("tags").selectAll().execute(),
    ).toHaveLength(1);
    expect(await readTagNames(database, itemId)).toEqual([]);
    await database.destroy();
  });
});
