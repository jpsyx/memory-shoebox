import { describe, expect, it } from "vitest";
import { itemDetailSchema } from "@memory-shoebox/shared";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemPerson,
  insertMember,
  insertPerson,
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

describe("PUT /api/items/:itemId/people", () => {
  it("replaces the people set and returns the whole item", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const keptId = await insertPerson(database, { displayName: "Mateo" });
    const droppedId = await insertPerson(database, { displayName: "Papá" });
    await insertItemPerson(database, { itemId, personId: keptId });
    await insertItemPerson(database, { itemId, personId: droppedId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/people`,
      headers: { cookie },
      payload: { people: [{ personId: keptId }, { displayName: "Mamá" }] },
    });

    expect(response.statusCode).toBe(200);
    const detail = itemDetailSchema.parse(response.json());
    expect(
      detail.people
        .map((person) => {
          return person.displayName;
        })
        .sort(),
    ).toEqual(["Mamá", "Mateo"]);
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
      url: `/api/items/${itemId}/people`,
      headers: { cookie: otherUploaderCookie },
      payload: { people: [{ displayName: "Mateo" }] },
    });
    const byViewer = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/people`,
      headers: { cookie: viewerCookie },
      payload: { people: [{ displayName: "Mateo" }] },
    });

    expect(byOtherUploader.statusCode).toBe(200);
    expect(byViewer.statusCode).toBe(403);
    expect(byViewer.json().error).toBe("item_edit_forbidden");
    await close();
  });

  it("refuses a blank display name", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/people`,
      headers: { cookie },
      payload: { people: [{ displayName: "" }] },
    });

    expect(response.statusCode).toBe(400);
    await close();
  });

  it("refuses thirty-one people", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/people`,
      headers: { cookie },
      payload: {
        people: Array.from({ length: 31 }, (_, index) => {
          return { displayName: `Person ${index}` };
        }),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.people).toBeDefined();
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
      url: `/api/items/${hiddenId}/people`,
      headers: { cookie },
      payload: { people: [{ displayName: "Mateo" }] },
    });
    const nothing = await app.inject({
      method: "PUT",
      url: `/api/items/${createId()}/people`,
      headers: { cookie },
      payload: { people: [{ displayName: "Mateo" }] },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    await close();
  });

  it("recomposes the alt text in the same response", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      captured_at: "2026-09-14T04:41:00.000Z",
      captured_on: "2026-09-14",
    });
    await insertRendition(database, { itemId });
    const mateoId = await insertPerson(database, { displayName: "Mateo" });
    const papaId = await insertPerson(database, { displayName: "Papá" });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/people`,
      headers: { cookie },
      payload: {
        people: [
          { personId: mateoId },
          { personId: papaId },
          { displayName: "Mamá" },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    // Tagging Mamá changes the alt text in the same response, with no
    // override written.
    expect(response.json().media.altText).toBe(
      "Mateo, Papá and Mamá, 14 September 2026",
    );
    expect(response.json().altTextOverride).toBeNull();
    await close();
  });

  it("never carries a memberId, even for somebody who holds an account", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const personId = await insertPerson(database, {
      displayName: "Marisol",
      member_id: memberId,
    });

    const response = await app.inject({
      method: "PUT",
      url: `/api/items/${itemId}/people`,
      headers: { cookie },
      payload: { people: [{ personId }] },
    });

    expect(response.json().people).toEqual([
      { personId, displayName: "Marisol" },
    ]);
    await close();
  });
});
