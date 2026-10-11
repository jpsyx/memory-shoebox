import { describe, expect, it, onTestFinished } from "vitest";
import type { Viewer } from "../../../src/http/requestContextHelpers.ts";
import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertVisibilityRule,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

async function _makeStaleAuthorityContext(): Promise<
  TestApp & { memberId: string; itemId: string; authenticatedViewer: Viewer }
> {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
    authenticate: async () => {
      return authenticatedViewer;
    },
  });
  onTestFinished(context.close);
  const { memberId, sessionId } = await insertSignedInMember(context);
  const authenticatedViewer: Viewer = {
    memberId,
    sessionId,
    role: "admin",
    isAdmin: true,
    visibleRuleIds: [],
  };
  const itemId = await insertItem(context.database, { uploadedBy: memberId });
  return { ...context, memberId, itemId, authenticatedViewer };
}

describe("bulk authority rechecks", () => {
  it("refuses a demoted member even when the request carries their earlier admin role", async () => {
    const { app, database, memberId, itemId } =
      await _makeStaleAuthorityContext();
    await database
      .updateTable("members")
      .set({ role: "viewer" })
      .where("id", "=", memberId)
      .execute();
    const response = await app.inject({
      method: "POST",
      url: "/api/items/bulk-edit",
      payload: { action: "delete", itemIds: [itemId] },
    });
    expect(response.statusCode).toBe(403);
    expect(
      await database.selectFrom("items").selectAll().execute(),
    ).toHaveLength(1);
  });

  it("rechecks visibility instead of using a stale admin bypass", async () => {
    const { app, database, itemId } = await _makeStaleAuthorityContext();
    const uploadedBy = await insertMember(database);
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy,
      seq: 1,
      visibility_rule_id: ruleId,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/items/bulk-edit",
      payload: {
        action: "tags",
        itemIds: [itemId, hiddenId],
        tags: ["Holiday"],
      },
    });
    expect(response.statusCode).toBe(404);
    expect(await database.selectFrom("tags").selectAll().execute()).toEqual([]);
  });
});

it("recomputes visibility when the request carries an obsolete rule membership", async () => {
  const { app, database, itemId, authenticatedViewer } =
    await _makeStaleAuthorityContext();
  const ruleId = await insertVisibilityRule(database, { mode: "only" });
  const hiddenId = await insertItem(database, {
    uploadedBy: await insertMember(database),
    seq: 1,
    visibility_rule_id: ruleId,
  });
  Object.assign(authenticatedViewer, {
    role: "uploader",
    isAdmin: false,
    visibleRuleIds: [ruleId],
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/items/bulk-edit",
    payload: { action: "tags", itemIds: [itemId, hiddenId], tags: ["Holiday"] },
  });
  expect(response.statusCode).toBe(404);
  expect(await database.selectFrom("tags").selectAll().execute()).toEqual([]);
});
