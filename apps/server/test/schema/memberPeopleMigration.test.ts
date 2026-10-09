import { Migrator } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrations } from "../../src/db/migrations/migrations.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("member people migration", () => {
  it("backfills active members without stealing ad-hoc names or replacing linked identities", async () => {
    const database = createDatabase(":memory:");
    const migrator = new Migrator({
      db: database,
      provider: {
        getMigrations: async () => {
          return migrations;
        },
      },
    });
    expect(
      (await migrator.migrateTo("0010_video_conversations")).error,
    ).toBeUndefined();
    const activeId = await insertMember(database, { display_name: "Ana" });
    const fallbackId = await insertMember(database, {
      display_name: null,
      email: "rosa@example.com",
    });
    const linkedMemberId = await insertMember(database, {
      display_name: "Current name",
    });
    const invitedId = await insertMember(database, { status: "invited" });
    const removedId = await insertMember(database, { status: "removed" });
    const adHocId = await insertPerson(database, { displayName: "Ana" });
    const linkedId = await insertPerson(database, {
      displayName: "Old name",
      member_id: linkedMemberId,
    });
    const itemId = await insertItem(database, { uploadedBy: activeId });
    await insertItemPerson(database, { itemId, personId: linkedId });
    await migrateToLatest(database);
    const people = await database.selectFrom("people").selectAll().execute();
    expect(
      people.filter((person) => {
        return person.member_id === activeId;
      }),
    ).toHaveLength(1);
    expect(
      people.find((person) => {
        return person.member_id === fallbackId;
      })?.display_name,
    ).toBe("rosa");
    expect(
      people.find((person) => {
        return person.id === linkedId;
      })?.display_name,
    ).toBe("Current name");
    expect(
      people.find((person) => {
        return person.id === adHocId;
      })?.member_id,
    ).toBeNull();
    expect(
      people.some((person) => {
        return person.member_id === invitedId || person.member_id === removedId;
      }),
    ).toBe(false);
    expect(
      await database.selectFrom("item_people").select("person_id").execute(),
    ).toEqual([{ person_id: linkedId }]);
    expect(await migrateToLatest(database)).toEqual([]);
    await database.destroy();
  });
});
