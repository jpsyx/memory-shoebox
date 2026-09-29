import { describe, expect, it } from "vitest";
import { tagsResponseSchema } from "@memory-shoebox/shared";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertItemTag,
  insertMember,
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

describe("GET /api/tags", () => {
  it("counts per viewer, orders by count then name, and pages never", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const beachId = await insertTag(database, { name: "Beach" });
    const summerId = await insertTag(database, { name: "summer" });
    // Tied with summer at one item each, so the response can only be
    // ordered correctly if the name tie-break actually runs.
    const zebraId = await insertTag(database, { name: "zebra" });
    const firstId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
    });
    const secondId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
    });
    await insertItemTag(database, { itemId: firstId, tagId: beachId });
    await insertItemTag(database, { itemId: secondId, tagId: beachId });
    await insertItemTag(database, { itemId: firstId, tagId: summerId });
    await insertItemTag(database, { itemId: secondId, tagId: zebraId });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(tagsResponseSchema.parse(response.json())).toEqual({
      tags: [
        { tag: { tagId: beachId, name: "Beach" }, itemCount: 2 },
        { tag: { tagId: summerId, name: "summer" }, itemCount: 1 },
        { tag: { tagId: zebraId, name: "zebra" }, itemCount: 1 },
      ],
      nextCursor: null,
    });
    await close();
  });

  it("keeps a tag whose every item is restricted, at zero", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const tagId = await insertTag(database, { name: "hospital" });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });
    await insertItemTag(database, { itemId, tagId });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags",
      headers: { cookie },
    });
    expect(response.json().tags).toEqual([
      { tag: { tagId, name: "hospital" }, itemCount: 0 },
    ]);
    await close();
  });

  it("keeps a tag nothing has ever been tagged with, at zero", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const tagId = await insertTag(database, { name: "unused" });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags",
      headers: { cookie },
    });
    expect(response.json().tags).toEqual([
      { tag: { tagId, name: "unused" }, itemCount: 0 },
    ]);
    await close();
  });

  it("narrows on the normalised name, ignoring case", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    await insertTag(database, { name: "Hospital" });
    await insertTag(database, { name: "beach" });

    const response = await app.inject({
      method: "GET",
      url: "/api/tags?q=HOSP",
      headers: { cookie },
    });
    expect(
      response.json().tags.map((entry: { tag: { name: string } }) => {
        return entry.tag.name;
      }),
    ).toEqual(["Hospital"]);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/tags" });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
