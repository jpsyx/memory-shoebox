import { describe, expect, it } from "vitest";
import { setItemsVisibilityResponseSchema } from "@memory-shoebox/shared";
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

describe("POST /api/items/visibility", () => {
  it("repoints the whole selection and answers with the refreshed prints", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });
    const itemIds = await Promise.all(
      [1, 2, 3].map(async (seq) => {
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq,
        });
        await insertRendition(database, { itemId });
        return itemId;
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: { itemIds, visibilityRuleId: ruleId },
    });

    expect(response.statusCode).toBe(200);
    const body = setItemsVisibilityResponseSchema.parse(response.json());
    expect(body.items).toHaveLength(3);
    expect(body.skippedCount).toBe(0);
    expect(body.nextCursor).toBeNull();
    expect(
      new Set(
        body.items.map((item) => {
          return item.visibility.visibilityRuleId;
        }),
      ),
    ).toEqual(new Set([ruleId]));
    // One row per item, never one for the batch: the log is read by subject
    // id, and a batch row answers no question anybody asks of it.
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toHaveLength(3);
    await close();
  });

  it("fails the whole request, writing nothing, when one id is invisible", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const mineId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    await insertRendition(database, { itemId: mineId });
    const hiddenId = await insertItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
      visibility_rule_id: hiddenRuleId,
    });
    const targetRuleId = await insertVisibilityRule(database, {
      mode: "except",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: { itemIds: [mineId, hiddenId], visibilityRuleId: targetRuleId },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("item_not_found");
    // No details naming which id failed: that list is a count of what the
    // viewer cannot see. An invisible id is still all or nothing, which is
    // the failure mode the per-item ownership skip does **not** cover.
    expect(response.json().details).toBeUndefined();
    expect(response.json().skippedCount).toBeUndefined();

    const untouched = await database
      .selectFrom("items")
      .select("visibility_rule_id")
      .where("id", "=", mineId)
      .executeTakeFirstOrThrow();
    expect(untouched.visibility_rule_id).toBe("visibility-rule-everyone");
    await close();
  });

  it("changes only the caller's own, and says how many it skipped", async () => {
    // The check is per item, not once for the batch: a selection spanning two
    // uploaders changes only the caller's own. The count is not the "4 of 6
    // updated" oracle: the caller already holds `uploadedBy` on every print.
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherId = await insertMember(database);
    const mineId = await insertItem(database, { uploadedBy: memberId, seq: 1 });
    const theirsId = await insertItem(database, {
      uploadedBy: otherId,
      seq: 2,
    });
    await Promise.all([
      insertRendition(database, { itemId: mineId }),
      insertRendition(database, { itemId: theirsId }),
    ]);
    const ruleId = await insertVisibilityRule(database, { mode: "except" });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: { itemIds: [mineId, theirsId], visibilityRuleId: ruleId },
    });

    expect(response.statusCode).toBe(200);
    const body = setItemsVisibilityResponseSchema.parse(response.json());
    expect(body.skippedCount).toBe(1);

    // Both prints come back, so the skipped one redraws with the visibility
    // it still has rather than disappearing out of the selection.
    expect(
      body.items.map((item) => {
        return [item.itemId, item.visibility.visibilityRuleId];
      }),
    ).toEqual([
      [mineId, ruleId],
      [theirsId, "visibility-rule-everyone"],
    ]);

    const stored = await database
      .selectFrom("items")
      .select(["id", "visibility_rule_id as visibilityRuleId"])
      .where("id", "in", [mineId, theirsId])
      .execute();
    expect(
      stored.find((row) => {
        return row.id === theirsId;
      })?.visibilityRuleId,
    ).toBe("visibility-rule-everyone");

    // One row per item actually moved, and none for the one left alone.
    const events = await database
      .selectFrom("activity_events")
      .select("subject_id as subjectId")
      .execute();
    expect(
      events.map((event) => {
        return event.subjectId;
      }),
    ).toEqual([mineId]);
    await close();
  });

  it("skips nothing for an admin, who may change anybody's", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({
      database,
      member: { role: "admin" },
    });
    const otherId = await insertMember(database);
    const theirsId = await insertItem(database, {
      uploadedBy: otherId,
      seq: 1,
    });
    await insertRendition(database, { itemId: theirsId });
    const ruleId = await insertVisibilityRule(database, { mode: "except" });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: { itemIds: [theirsId], visibilityRuleId: ruleId },
    });

    expect(response.statusCode).toBe(200);
    const body = setItemsVisibilityResponseSchema.parse(response.json());
    expect(body.skippedCount).toBe(0);
    expect(body.items[0]?.visibility.visibilityRuleId).toBe(ruleId);
    await close();
  });

  it("includes an item already pointing at the rule, and writes nothing for it", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });

    const response = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: {
        itemIds: [itemId],
        visibilityRuleId: "visibility-rule-everyone",
      },
    });

    expect(response.json().items).toHaveLength(1);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("refuses an empty selection, a duplicate id and more than a thousand", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });

    const empty = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: { itemIds: [], visibilityRuleId: "visibility-rule-everyone" },
    });
    const duplicated = await app.inject({
      method: "POST",
      url: "/api/items/visibility",
      headers: { cookie },
      payload: {
        itemIds: [itemId, itemId],
        visibilityRuleId: "visibility-rule-everyone",
      },
    });

    expect(empty.statusCode).toBe(400);
    expect(duplicated.statusCode).toBe(400);
    await close();
  });
});
