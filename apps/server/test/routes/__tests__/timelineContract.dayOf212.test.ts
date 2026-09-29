import { describe, expect, it } from "vitest";
import { insertSignedInMember } from "../../helpers/insertSignedInMember.ts";
import {
  insertGroup,
  insertItemMilestone,
  insertItemPerson,
  insertItemTag,
  insertMember,
  insertMilestone,
  insertPerson,
  insertTag,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { insertDrawableItem, makeApp } from "./timelineContractTestHelpers.ts";

describe("a day of 212 that reads as 204", () => {
  it("counts and draws only what the viewer may see, and names nothing else", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });

    const visibleIds = await Promise.all(
      Array.from({ length: 204 }, (_unused, index) => {
        return insertDrawableItem(database, {
          uploadedBy: memberId,
          seq: index + 1,
        });
      }),
    );
    const hiddenIds = await Promise.all(
      Array.from({ length: 8 }, (_unused, index) => {
        return insertDrawableItem(database, {
          uploadedBy: otherMemberId,
          seq: 300 + index,
          visibilityRuleId: hiddenRuleId,
        });
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    const [day] = response.json().days;
    expect(day.itemCount).toBe(204);
    expect(day.unseenCount).toBe(204);
    expect(day.items).toHaveLength(204);
    expect(visibleIds).toHaveLength(204);
    hiddenIds.forEach((hiddenId) => {
      expect(response.body).not.toContain(hiddenId);
    });
    await close();
  });

  it("moves the count and the rows together when one item is restricted", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    await insertDrawableItem(database, { uploadedBy: memberId, seq: 1 });
    const movingId = await insertDrawableItem(database, {
      uploadedBy: otherMemberId,
      seq: 2,
    });
    const tagId = await insertTag(database, { name: "beach" });
    await insertItemTag(database, { itemId: movingId, tagId });
    const milestoneId = await insertMilestone(database, {
      name: "A day at the beach",
      startsOn: "2026-09-14",
    });
    await insertItemMilestone(database, { itemId: movingId, milestoneId });

    const before = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(before.json().days[0].itemCount).toBe(2);
    expect(before.json().days[0].items).toHaveLength(2);
    expect(before.json().days[0].milestoneBand.itemCount).toBe(1);

    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await database
      .updateTable("items")
      .set({ visibility_rule_id: hiddenRuleId })
      .where("id", "=", movingId)
      .execute();

    const after = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });
    expect(after.json().days[0].itemCount).toBe(1);
    expect(after.json().days[0].items).toHaveLength(1);
    expect(after.json().days[0].milestoneBand.itemCount).toBe(0);
    await close();
  });

  it("keeps a photograph restricted to admins out of a viewer it tags", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const adminId = await insertMember(database, { role: "admin" });
    const adminsOnlyGroupId = await insertGroup(database, { name: "Admins" });
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, {
      ruleId: hiddenRuleId,
      groupId: adminsOnlyGroupId,
    });
    const hiddenId = await insertDrawableItem(database, {
      uploadedBy: adminId,
      seq: 1,
      visibilityRuleId: hiddenRuleId,
    });
    // Being in a photograph is not a key to it (Decision 7).
    const personId = await insertPerson(database, {
      displayName: "Abuela Rosa",
      member_id: memberId,
    });
    await insertItemPerson(database, { itemId: hiddenId, personId });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline",
      headers: { cookie },
    });

    expect(response.json().days).toEqual([]);
    await close();
  });
});
