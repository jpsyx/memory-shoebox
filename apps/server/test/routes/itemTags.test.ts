import { describe, expect, it } from "vitest";
import { itemDetailSchema } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemTag,
  insertMember,
  insertRendition,
  insertTag,
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

describe("PUT /api/items/:itemId/tags", () => {
  it("replaces the tag set and returns the whole item", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const keptId = await insertTag(database, { name: "Hospital" });
    const droppedId = await insertTag(database, { name: "Beach" });
    await insertItemTag(database, { itemId, tagId: keptId });
    await insertItemTag(database, { itemId, tagId: droppedId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/tags`,
      headers: { cookie },
      payload: { tags: ["Hospital", "Mateo"] },
    });

    expect(response.statusCode).toBe(200);
    const detail = itemDetailSchema.parse(response.json());
    expect(
      detail.tags
        .map((tag) => {
          return tag.name;
        })
        .sort(),
    ).toEqual(["Hospital", "Mateo"]);
    await close();
  });

  it("lets any uploader tag anybody's photograph, and refuses a viewer", async () => {
    const { app, database, close } = await makeApp();
    const uploaderId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertRendition(database, { itemId });
    const { cookie: otherUploaderCookie } = await insertSignedInMember({
      database,
      token: "other-uploader",
    });
    const { cookie: viewerCookie } = await insertSignedInMember({
      database,
      token: "viewer",
      member: { role: "viewer" },
    });

    const byOtherUploader = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/tags`,
      headers: { cookie: otherUploaderCookie },
      payload: { tags: ["Beach"] },
    });
    const byViewer = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/tags`,
      headers: { cookie: viewerCookie },
      payload: { tags: ["Beach"] },
    });

    expect(byOtherUploader.statusCode).toBe(200);
    expect(byViewer.statusCode).toBe(403);
    expect(byViewer.json().error).toBe("item_edit_forbidden");
    await close();
  });

  it("refuses a blank name", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/tags`,
      headers: { cookie },
      payload: { tags: [""] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors["tags.0"]).toBeDefined();
    await close();
  });

  it("refuses fifty-one tags", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/tags`,
      headers: { cookie },
      payload: {
        tags: Array.from({ length: 51 }, (_, index) => {
          return `tag-${index}`;
        }),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.tags).toBeDefined();
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
      method: "PUT",
      url: `/api/items/${hiddenId}/tags`,
      headers: { cookie },
      payload: { tags: ["Beach"] },
    });
    const nothing = await app.inject({
      method: "PUT",
      url: `/api/items/${createId()}/tags`,
      headers: { cookie },
      payload: { tags: ["Beach"] },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    await close();
  });
});
