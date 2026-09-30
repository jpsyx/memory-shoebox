import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("PATCH /api/items/:itemId/visibility", () => {
  it("repoints the item and writes an audit row carrying both rules", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/visibility`,
      headers: { cookie },
      payload: { visibilityRuleId: ruleId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().visibility.visibilityRuleId).toBe(ruleId);

    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event.kind).toBe("item_visibility_changed");
    expect(JSON.parse(event.detail_json ?? "{}")).toMatchObject({
      previousVisibilityRuleId: "visibility-rule-everyone",
      visibilityRuleId: ruleId,
    });
    await close();
  });

  it("leaves the old rule exactly as it was, covering everything else", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const sharedRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: sharedRuleId,
      memberId,
    });
    const movedId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 1,
      visibility_rule_id: sharedRuleId,
    });
    const stayingId = await insertItem(database, {
      uploadedBy: memberId,
      seq: 2,
      visibility_rule_id: sharedRuleId,
    });
    await insertRendition(database, { itemId: movedId });

    await app.inject({
      method: "PATCH",
      url: `/api/items/${movedId}/visibility`,
      headers: { cookie },
      payload: { visibilityRuleId: "visibility-rule-everyone" },
    });

    const staying = await database
      .selectFrom("items")
      .select("visibility_rule_id")
      .where("id", "=", stayingId)
      .executeTakeFirstOrThrow();
    expect(staying.visibility_rule_id).toBe(sharedRuleId);
    expect(
      await database
        .selectFrom("visibility_rule_subjects")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
    await close();
  });

  it("is a no-op with no write and no log row", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/visibility`,
      headers: { cookie },
      payload: { visibilityRuleId: "visibility-rule-everyone" },
    });

    expect(response.statusCode).toBe(200);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("belongs to the item's own uploader, not to any uploader", async () => {
    const { app, database, close } = await makeApp();
    const uploaderId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    await insertRendition(database, { itemId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
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
      method: "PATCH",
      url: `/api/items/${itemId}/visibility`,
      headers: { cookie: otherUploaderCookie },
      payload: { visibilityRuleId: ruleId },
    });
    const byAdmin = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/visibility`,
      headers: { cookie: adminCookie },
      payload: { visibilityRuleId: ruleId },
    });

    expect(byOther.statusCode).toBe(403);
    expect(byOther.json().error).toBe("item_visibility_forbidden");
    expect(byAdmin.statusCode).toBe(200);
    await close();
  });

  it("is a 400, not a 404, when the rule names nothing", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/visibility`,
      headers: { cookie },
      payload: { visibilityRuleId: "visibility-rule-nothing" },
    });

    // Rules are not visibility-scoped, and the item is the resource being
    // addressed.
    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors.visibilityRuleId).toBeDefined();
    await close();
  });

  it("lets an item be made invisible to the person setting it", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId: otherId });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/items/${itemId}/visibility`,
      headers: { cookie },
      payload: { visibilityRuleId: ruleId },
    });

    // The uploader still sees it through clause 2 of the evaluation, so the
    // response composes and no guard is needed.
    expect(response.statusCode).toBe(200);
    await close();
  });
});
