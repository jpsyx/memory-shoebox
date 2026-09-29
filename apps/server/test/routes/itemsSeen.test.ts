import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types/db.types.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertUploadSession,
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

const readViewedItemIds = async (
  database: Kysely<Database>,
  memberId: string,
): Promise<string[]> => {
  const rows = await database
    .selectFrom("item_views")
    .select("item_id")
    .where("member_id", "=", memberId)
    .execute();
  return rows
    .map((row) => {
      return row.item_id;
    })
    .sort();
};

describe("POST /api/items/seen", () => {
  it("latches what the viewer can see and answers nothing at all", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(await readViewedItemIds(database, memberId)).toEqual([itemId]);
    await close();
  });

  it("ignores an invisible id and a nonexistent one, identically", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 1,
      visibility_rule_id: hiddenRuleId,
    });

    const hidden = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [hiddenId] },
    });
    const nonexistent = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: ["0199c0a0-0000-7000-8000-00000000dead"] },
    });

    expect(hidden.statusCode).toBe(204);
    expect(nonexistent.statusCode).toBe(204);
    expect(hidden.body).toBe(nonexistent.body);
    expect(await readViewedItemIds(database, memberId)).toEqual([]);
    await close();
  });

  it("is one-way: a second post writes nothing and moves nothing", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId, seq: 1 });

    await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });
    const first = await database
      .selectFrom("item_views")
      .select(["id", "first_seen_at"])
      .where("member_id", "=", memberId)
      .executeTakeFirstOrThrow();

    const second = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [itemId] },
    });

    expect(second.statusCode).toBe(204);
    const after = await database
      .selectFrom("item_views")
      .select(["id", "first_seen_at"])
      .where("member_id", "=", memberId)
      .execute();
    expect(after).toEqual([first]);
    await close();
  });

  it("expands a collapsed stack to its visible frames", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: otherMemberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const visibleFrameIds = await Promise.all(
      [1, 2].map((index) => {
        return insertItem(database, {
          uploadedBy: otherMemberId,
          seq: index,
          burst_id: burstId,
          burst_index: index,
        });
      }),
    );
    await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 3,
      burst_id: burstId,
      burst_index: 3,
      visibility_rule_id: hiddenRuleId,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [], burstIds: [burstId] },
    });

    expect(response.statusCode).toBe(204);
    expect(await readViewedItemIds(database, memberId)).toEqual(
      [...visibleFrameIds].sort(),
    );
    await close();
  });

  it("writes nothing at all for an empty batch", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    await insertItem(database, { uploadedBy: memberId, seq: 1 });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: [] },
    });

    expect(response.statusCode).toBe(204);
    expect(await readViewedItemIds(database, memberId)).toEqual([]);
    await close();
  });

  it("refuses more than five hundred ids, and an id that is not a uuid", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });

    const tooMany = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: {
        itemIds: Array.from({ length: 501 }, () => {
          return "0199c0a0-0000-7000-8000-00000000dead";
        }),
      },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error).toBe("invalid_request");

    const notAUuid = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      headers: { cookie },
      payload: { itemIds: ["7"] },
    });
    expect(notAUuid.statusCode).toBe(400);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/items/seen",
      payload: { itemIds: [] },
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
