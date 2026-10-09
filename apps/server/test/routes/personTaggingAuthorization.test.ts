import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createAuthenticator } from "../../src/auth/createAuthenticator.ts";
import { createDatabase } from "../../src/db/client.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const changes = ["demotion", "removal", "visibility"] as const;

describe("person action transaction authorization", () => {
  it.each(changes)(
    "rechecks %s after request authentication",
    async (change) => {
      const database = createDatabase(":memory:");
      const clock = () => {
        return new Date(NOW);
      };
      const authenticate = createAuthenticator({ database, clock });
      let beforeAction = async () => {};
      const { app, close } = await createTestApp({
        database,
        clock,
        authenticate: async (request) => {
          const viewer = await authenticate(request);
          await beforeAction();
          return viewer;
        },
      });
      const signedIn = await insertSignedInMember({ database });
      const ownerId = await insertMember(database);
      const itemId = await insertItem(database, { uploadedBy: ownerId });
      const personId = await insertPerson(database, {
        displayName: "Ana",
        created_by: signedIn.memberId,
      });
      await insertItemPerson(database, { itemId, personId });
      const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
      beforeAction = async () => {
        if (change === "visibility") {
          await database
            .updateTable("items")
            .set({ visibility_rule_id: hiddenRule })
            .where("id", "=", itemId)
            .execute();
        } else {
          await database
            .updateTable("members")
            .set(
              change === "demotion"
                ? { role: "viewer" }
                : { status: "removed" },
            )
            .where("id", "=", signedIn.memberId)
            .execute();
        }
      };
      const response = await app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}/people/${personId}`,
        headers: { cookie: signedIn.cookie },
      });
      expect(response.statusCode).toBe(
        change === "demotion" ? 403 : change === "removal" ? 401 : 404,
      );
      expect(
        await database
          .selectFrom("people")
          .select("id")
          .where("id", "=", personId)
          .execute(),
      ).toEqual([{ id: personId }]);
      expect(
        await database
          .selectFrom("item_people")
          .select("person_id")
          .where("item_id", "=", itemId)
          .execute(),
      ).toEqual([{ person_id: personId }]);
      await close();
    },
  );

  it("rolls the untag back when deleting the identity fails", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const personId = await insertPerson(database, { displayName: "Ana" });
    await insertItemPerson(database, { itemId, personId });
    await sql`CREATE TRIGGER prevent_person_deletion BEFORE DELETE ON people BEGIN SELECT RAISE(ABORT, 'forced person deletion failure'); END`.execute(
      database,
    );
    const response = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}/people/${personId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(500);
    expect(
      await database
        .selectFrom("item_people")
        .select("person_id")
        .where("item_id", "=", itemId)
        .execute(),
    ).toEqual([{ person_id: personId }]);
    await close();
  });
});
