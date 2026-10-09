import {
  insertUploadBatchEdit,
  insertUploadSession,
} from "../helpers/seedHelpers/itemSeedHelpers.ts";
import { describe, expect, it } from "vitest";
import {
  itemDetailSchema,
  personTaggingOptionsResponseSchema,
} from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { createId } from "../../src/db/createId.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _makeFixture() {
  const fixture = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const identity = await insertSignedInMember({ database: fixture.database });
  const itemId = await insertItem(fixture.database, {
    uploadedBy: identity.memberId,
  });
  await insertRendition(fixture.database, { itemId });
  return { ...fixture, ...identity, itemId };
}

describe("item person actions", () => {
  it("returns visible counts but forbids deletion for hidden usage", async () => {
    const { app, database, close, cookie, memberId, itemId } =
      await _makeFixture();
    const personId = await insertPerson(database, {
      displayName: "Ana",
      created_by: memberId,
    });
    await insertItemPerson(database, { itemId, personId });
    const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
    const otherMember = await insertMember(database);
    const hiddenItem = await insertItem(database, {
      uploadedBy: otherMember,
      seq: 2,
      visibility_rule_id: hiddenRule,
    });
    await insertItemPerson(database, { itemId: hiddenItem, personId });
    const linkedId = await insertPerson(database, {
      displayName: "Rosa",
      member_id: otherMember,
    });
    const unusedId = await insertPerson(database, { displayName: "Unused" });
    const response = await app.inject({
      method: "GET",
      url: `/api/items/${itemId}/people/options`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { people } = personTaggingOptionsResponseSchema.parse(
      response.json(),
    );
    expect(people).toContainEqual({
      person: { personId, displayName: "Ana" },
      itemCount: 1,
      canRename: true,
      canDelete: false,
    });
    expect(people).toContainEqual({
      person: { personId: linkedId, displayName: "Rosa" },
      itemCount: 0,
      canRename: false,
      canDelete: false,
    });
    expect(people).toContainEqual({
      person: { personId: unusedId, displayName: "Unused" },
      itemCount: 0,
      canRename: false,
      canDelete: true,
    });
    expect(response.body).not.toContain(hiddenItem);
    expect(response.body).not.toContain(otherMember);
    await close();
  });

  it("renames the creator's ad-hoc person across tagged items and suggestions", async () => {
    const { app, database, close, cookie, memberId, itemId } =
      await _makeFixture();
    const personId = await insertPerson(database, {
      displayName: "Anaa",
      created_by: memberId,
    });
    const otherItemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertItemPerson(database, { itemId: otherItemId, personId });
    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/people/${personId}`,
      headers: { cookie },
      payload: { displayName: "  Ana  " },
    });
    expect(response.statusCode).toBe(200);
    expect(itemDetailSchema.parse(response.json()).people).toEqual([]);
    expect(
      await database
        .selectFrom("people")
        .select("display_name")
        .where("id", "=", personId)
        .executeTakeFirst(),
    ).toEqual({ display_name: "Ana" });
    expect(
      await database
        .selectFrom("item_people")
        .select("person_id")
        .where("item_id", "=", otherItemId)
        .execute(),
    ).toEqual([{ person_id: personId }]);
    await close();
  });

  it("lets an admin rename another creator's person but refuses other uploaders", async () => {
    const { app, database, close, cookie, itemId } = await _makeFixture();
    const creator = await insertMember(database);
    const personId = await insertPerson(database, {
      displayName: "Anaa",
      created_by: creator,
    });
    const denied = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/people/${personId}`,
      headers: { cookie },
      payload: { displayName: "Ana" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("person_rename_forbidden");
    const admin = await insertSignedInMember({
      database,
      token: "admin-person",
      member: { role: "admin" },
    });
    const allowed = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/people/${personId}`,
      headers: { cookie: admin.cookie },
      payload: { displayName: "Ana" },
    });
    expect(allowed.statusCode).toBe(200);
    await close();
  });

  it.each(["PATCH", "DELETE"] as const)(
    "refuses %s for linked members even to admins",
    async (method) => {
      const { app, database, close, memberId, itemId } = await _makeFixture();
      const admin = await insertSignedInMember({
        database,
        token: "admin-linked",
        member: { role: "admin" },
      });
      const personId = await insertPerson(database, {
        displayName: "Rosa",
        member_id: memberId,
        created_by: admin.memberId,
      });
      const response = await app.inject({
        method,
        url: `/api/items/${itemId}/people/${personId}`,
        headers: { cookie: admin.cookie },
        ...(method === "PATCH" ? { payload: { displayName: "Ana" } } : {}),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("person_linked_member");
      expect(
        await database
          .selectFrom("people")
          .select("display_name")
          .where("id", "=", personId)
          .executeTakeFirst(),
      ).toEqual({ display_name: "Rosa" });
      await close();
    },
  );

  it("deletes only the current tag and person atomically for any uploader", async () => {
    const { app, database, close, cookie, itemId } = await _makeFixture();
    const personId = await insertPerson(database, {
      displayName: "Mistake",
      created_by: await insertMember(database),
    });
    await insertItemPerson(database, { itemId, personId });
    const response = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}/people/${personId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(itemDetailSchema.parse(response.json()).people).toEqual([]);
    expect(
      await database
        .selectFrom("people")
        .select("id")
        .where("id", "=", personId)
        .execute(),
    ).toEqual([]);
    expect(
      await database
        .selectFrom("item_people")
        .select("id")
        .where("person_id", "=", personId)
        .execute(),
    ).toEqual([]);
    await close();
  });

  it("deletes an unused suggestion and refuses a stale deletion after another tag", async () => {
    const { app, database, close, cookie, memberId, itemId } =
      await _makeFixture();
    const unusedId = await insertPerson(database, { displayName: "Unused" });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}/people/${unusedId}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    const personId = await insertPerson(database, { displayName: "Ana" });
    await insertItemPerson(database, { itemId, personId });
    const options = await app.inject({
      method: "GET",
      url: `/api/items/${itemId}/people/options`,
      headers: { cookie },
    });
    expect(
      options.json().people.find((option: { person: { personId: string } }) => {
        return option.person.personId === personId;
      }).canDelete,
    ).toBe(true);
    const otherItemId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertItemPerson(database, { itemId: otherItemId, personId });
    const blocked = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}/people/${personId}`,
      headers: { cookie },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("person_used_elsewhere");
    expect(
      await database
        .selectFrom("item_people")
        .select("id")
        .where("person_id", "=", personId)
        .execute(),
    ).toHaveLength(2);
    await close();
  });

  it.each([null, "Original spelling"])(
    "preserves and cancels upload plans with label %s when deleting a person",
    async (labelSnapshot) => {
      const { app, database, close, cookie, memberId, itemId } =
        await _makeFixture();
      const personId = await insertPerson(database, { displayName: "Ana" });
      await insertItemPerson(database, { itemId, personId });
      const uploadSessionId = await insertUploadSession(database, {
        uploadedBy: memberId,
      });
      const editId = await insertUploadBatchEdit({
        database,
        options: {
          uploadSessionId,
          createdBy: memberId,
          kind: "person",
          person_id: personId,
          label_snapshot: labelSnapshot,
        },
      });
      const response = await app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}/people/${personId}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(
        await database
          .selectFrom("upload_batch_edits")
          .select(["person_id", "label_snapshot", "undone_at"])
          .where("id", "=", editId)
          .executeTakeFirst(),
      ).toEqual({
        person_id: null,
        label_snapshot: labelSnapshot ?? "Ana",
        undone_at: NOW,
      });
      expect(
        await database
          .selectFrom("people")
          .select("id")
          .where("id", "=", personId)
          .execute(),
      ).toEqual([]);
      await close();
    },
  );

  it.each(["GET", "PATCH", "DELETE"] as const)(
    "requires content editing and hides invisible items for %s",
    async (method) => {
      const { app, database, close, itemId, memberId } = await _makeFixture();
      const viewer = await insertSignedInMember({
        database,
        token: "viewer-actions",
        member: { role: "viewer" },
      });
      const personId = await insertPerson(database, {
        displayName: "Ana",
        created_by: viewer.memberId,
      });
      const suffix = method === "GET" ? "options" : personId;
      const payload =
        method === "PATCH" ? { payload: { displayName: "Ana" } } : {};
      const response = await app.inject({
        method,
        url: `/api/items/${itemId}/people/${suffix}`,
        headers: { cookie: viewer.cookie },
        ...payload,
      });
      expect(response.statusCode).toBe(403);
      const hiddenId = await insertItem(database, {
        uploadedBy: memberId,
        seq: 2,
        visibility_rule_id: await insertVisibilityRule(database, {
          mode: "only",
        }),
      });
      const hidden = await app.inject({
        method,
        url: `/api/items/${hiddenId}/people/${suffix}`,
        headers: { cookie: viewer.cookie },
        ...payload,
      });
      const missing = await app.inject({
        method,
        url: `/api/items/${createId()}/people/${suffix}`,
        headers: { cookie: viewer.cookie },
        ...payload,
      });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.body).toBe(missing.body);
      await close();
    },
  );
});
