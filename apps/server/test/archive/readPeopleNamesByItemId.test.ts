import { describe, expect, it } from "vitest";
import { readPeopleNamesByItemId } from "../../src/archive/readPeopleNamesByItemId.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("readPeopleNamesByItemId", () => {
  it("returns names in tagging order, then alphabetically", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    const papaId = await insertPerson(database, { displayName: "Papá" });
    const mamaId = await insertPerson(database, { displayName: "Mamá" });
    await insertItemPerson(database, {
      itemId,
      personId: mateoId,
      tagged_at: NOW,
    });
    await insertItemPerson(database, {
      itemId,
      personId: papaId,
      tagged_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });
    await insertItemPerson(database, {
      itemId,
      personId: mamaId,
      tagged_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    expect(
      (await readPeopleNamesByItemId({ database, itemIds: [itemId] })).get(
        itemId,
      ),
    ).toEqual(["Mateo", "Mamá", "Papá"]);

    await database.destroy();
  });

  it("is empty for no ids", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    expect(
      (await readPeopleNamesByItemId({ database, itemIds: [] })).size,
    ).toBe(0);
    await database.destroy();
  });
});
