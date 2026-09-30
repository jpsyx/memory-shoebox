import { describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createId } from "../../src/db/createId.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { setItemPeople } from "../../src/items/setItemPeople.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

const readPersonNames = async (database: Kysely<Database>, itemId: string) => {
  const rows = await database
    .selectFrom("item_people")
    .innerJoin("people", "people.id", "item_people.person_id")
    .select([
      "people.display_name as displayName",
      "item_people.tagged_at as taggedAt",
    ])
    .where("item_people.item_id", "=", itemId)
    .execute();
  return rows;
};

describe("setItemPeople", () => {
  it("attaches existing people by id", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });

    await setItemPeople({
      transaction: database,
      itemId,
      memberId,
      people: [{ personId: mateoId }],
      now: NOW,
    });

    expect(
      (await readPersonNames(database, itemId)).map((row) => {
        return row.displayName;
      }),
    ).toEqual(["Mateo"]);
    await database.destroy();
  });

  it("diffs rather than replacing, so untouched provenance survives", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const keptId = await insertPerson(database, { displayName: "Mateo" });
    const droppedId = await insertPerson(database, { displayName: "Papá" });
    await insertItemPerson(database, { itemId, personId: keptId });
    await insertItemPerson(database, { itemId, personId: droppedId });
    const later = shiftMinutes({ instant: NOW, minutes: 10 });

    await setItemPeople({
      transaction: database,
      itemId,
      memberId,
      people: [{ personId: keptId }, { displayName: "Mamá" }],
      now: later,
    });

    const rows = await readPersonNames(database, itemId);
    expect(
      rows
        .map((row) => {
          return row.displayName;
        })
        .sort(),
    ).toEqual(["Mamá", "Mateo"]);
    expect(
      rows.find((row) => {
        return row.displayName === "Mateo";
      })?.taggedAt,
    ).toBe(NOW);
    await database.destroy();
  });

  it("creates somebody the archive has never heard of, with no account link", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    await setItemPeople({
      transaction: database,
      itemId,
      memberId,
      people: [{ displayName: "Mamá" }],
      now: NOW,
    });

    const person = await database
      .selectFrom("people")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(person.display_name).toBe("Mamá");
    // The link between a person and an account is made elsewhere, and a
    // person record may never get one.
    expect(person.member_id).toBeNull();
    expect(person.created_by).toBe(memberId);
    await database.destroy();
  });

  it("refuses a personId naming nobody", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    await expect(
      setItemPeople({
        transaction: database,
        itemId,
        memberId,
        people: [{ personId: createId() }],
        now: NOW,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await database.destroy();
  });

  it("untags without touching the person row", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const personId = await insertPerson(database, { displayName: "Marisol" });
    await insertItemPerson(database, { itemId, personId });

    await setItemPeople({
      transaction: database,
      itemId,
      memberId,
      people: [],
      now: NOW,
    });

    // `people` rows survive, which is what keeps somebody findable after
    // their only photograph comes down.
    expect(
      await database.selectFrom("people").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("item_people").selectAll().execute(),
    ).toEqual([]);
    await database.destroy();
  });
});
