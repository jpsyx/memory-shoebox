import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("DELETE /api/items/:itemId", () => {
  it("answers 204 with no body, and enqueues the objects", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId, purpose: "original" });
    await insertRendition(database, { itemId, purpose: "thumb" });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}`,
      headers: { cookie },
    });

    // There is nothing to return: the resource is gone, and there is no
    // soft-deleted shadow of it to describe.
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await database.selectFrom("items").selectAll().execute()).toEqual(
      [],
    );
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toHaveLength(2);
    await close();
  });

  it("belongs to the item's own uploader, not to any uploader", async () => {
    const { app, database, close } = await makeApp();
    const uploaderId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertRendition(database, { itemId });
    const { cookie: otherUploaderCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin",
      member: { role: "admin" },
    });

    const byOther = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}`,
      headers: { cookie: otherUploaderCookie },
    });
    expect(byOther.statusCode).toBe(403);
    expect(byOther.json().error).toBe("item_delete_forbidden");
    // The refusal changed nothing, so the admin still has something to delete.
    expect(
      await database.selectFrom("items").selectAll().execute(),
    ).toHaveLength(1);

    const byAdmin = await app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}`,
      headers: { cookie: adminCookie },
    });
    expect(byAdmin.statusCode).toBe(204);
    await close();
  });

  it("is a 404 on an invisible item, byte-identical to a bad id", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      visibility_rule_id: hiddenRuleId,
    });

    const hidden = await app.inject({
      method: "DELETE",
      url: `/api/items/${hiddenId}`,
      headers: { cookie },
    });
    const nothing = await app.inject({
      method: "DELETE",
      url: `/api/items/${createId()}`,
      headers: { cookie },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    await close();
  });
});
