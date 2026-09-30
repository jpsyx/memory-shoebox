import { describe, expect, it } from "vitest";
import { commentDtoSchema } from "@memory-shoebox/shared";
import { createId } from "../../../src/db/createId.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("POST /api/items/:itemId/comments", () => {
  it("writes the comment and answers 201 with the whole comment", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "  He has your father's chin.  " },
    });

    expect(response.statusCode).toBe(201);
    const comment = commentDtoSchema.parse(response.json());
    expect(comment.body).toBe("He has your father's chin.");
    expect(comment.editedAt).toBeNull();
    expect(comment.canEdit).toBe(true);
    expect(comment.canDelete).toBe(true);
    expect(comment.reactions).toEqual({ kinds: [], myKind: null });
    await close();
  });

  it("lets a viewer comment, because opening an item is the permission", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "viewer" },
    });
    const uploaderId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });

    const response = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "Qué guapo" },
    });

    expect(response.statusCode).toBe(201);
    await close();
  });

  it("pins a comment to a moment, and clamps a float a hair over the end", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: 30_000,
    });

    const inside = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "Right here", atSeconds: 12.5 },
    });
    const past = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "At the very end", atSeconds: 30.000001 },
    });

    expect(inside.json().atSeconds).toBe(12.5);
    expect(past.json().atSeconds).toBe(30);
    await close();
  });

  it("refuses a pin on a photograph, which has no transport", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "Where?", atSeconds: 4 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors.atSeconds).toBeDefined();
    await close();
  });

  it("refuses an empty body and one over four thousand characters", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const blank = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "   " },
    });
    const long = await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "x".repeat(4001) },
    });

    expect(blank.statusCode).toBe(400);
    expect(long.statusCode).toBe(400);
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
      method: "POST",
      url: `/api/items/${hiddenId}/comments`,
      headers: { cookie },
      payload: { body: "I can see this" },
    });
    const nothing = await app.inject({
      method: "POST",
      url: `/api/items/${createId()}/comments`,
      headers: { cookie },
      payload: { body: "I can see this" },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(nothing.body);
    expect(await database.selectFrom("comments").selectAll().execute()).toEqual(
      [],
    );
    await close();
  });

  it("does not count an open", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    await app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie },
      payload: { body: "Saying something is not opening something" },
    });

    expect(
      await database.selectFrom("item_views").selectAll().execute(),
    ).toEqual([]);
    await close();
  });
});
