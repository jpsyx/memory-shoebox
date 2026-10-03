import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { createId } from "../../src/db/createId.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("milestone attachment deltas", () => {
  it("attaches and detaches idempotently, preserving existing metadata, hidden joins, and item facts", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const other = await insertMember(database);
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-09-01",
      });
      const itemId = await insertItem(database, { uploadedBy: memberId });
      const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
      const hiddenId = await insertItem(database, {
        uploadedBy: other,
        seq: 1,
        visibility_rule_id: hiddenRule,
      });
      await insertItemMilestone(database, { itemId: hiddenId, milestoneId });
      const hiddenAttachment = await database
        .selectFrom("item_milestones")
        .selectAll()
        .where("item_id", "=", hiddenId)
        .executeTakeFirstOrThrow();
      const itemsBefore = await database
        .selectFrom("items")
        .selectAll()
        .execute();
      const delta = (attach: string[], detach: string[]) => {
        return app.inject({
          method: "PATCH",
          url: `/api/milestones/${milestoneId}/items`,
          headers: { cookie },
          payload: { attach, detach },
        });
      };
      const attached = await delta([itemId], []);
      expect(attached.statusCode).toBe(200);
      expect(attached.json()).toMatchObject({
        attachedCount: 1,
        detachedCount: 0,
        itemCount: 1,
        mismatchCount: 1,
      });
      await database
        .updateTable("item_milestones")
        .set({ span_mismatch_acknowledged_at: "2026-09-25T00:00:00.000Z" })
        .where("item_id", "=", itemId)
        .execute();
      const beforeDuplicate = await database
        .selectFrom("item_milestones")
        .selectAll()
        .execute();
      expect((await delta([itemId], [])).json()).toMatchObject({
        attachedCount: 0,
        detachedCount: 0,
      });
      expect(
        await database.selectFrom("item_milestones").selectAll().execute(),
      ).toEqual(beforeDuplicate);
      expect((await delta([], [itemId])).json()).toMatchObject({
        attachedCount: 0,
        detachedCount: 1,
      });
      expect((await delta([], [itemId])).json()).toMatchObject({
        attachedCount: 0,
        detachedCount: 0,
      });
      expect(
        await database.selectFrom("item_milestones").selectAll().execute(),
      ).toContainEqual(hiddenAttachment);
      expect(await database.selectFrom("items").selectAll().execute()).toEqual(
        itemsBefore,
      );
      expect(
        await database
          .selectFrom("item_capture_date_changes")
          .selectAll()
          .execute(),
      ).toEqual([]);
    } finally {
      await close();
    }
  });

  it("makes inaccessible detach byte-identical to nonexistent and rolls back an accessible attach", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const other = await insertMember(database);
      const rule = await insertVisibilityRule(database, { mode: "only" });
      const hidden = await insertItem(database, {
        uploadedBy: other,
        visibility_rule_id: rule,
      });
      const visible = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
      });
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-09-01",
      });
      await insertItemMilestone(database, { milestoneId, itemId: hidden });
      const before = await database
        .selectFrom("item_milestones")
        .selectAll()
        .execute();
      const delta = (detachId: string) => {
        return app.inject({
          method: "PATCH",
          url: `/api/milestones/${milestoneId}/items`,
          headers: { cookie },
          payload: { attach: [visible], detach: [detachId] },
        });
      };
      const rejected = await delta(hidden);
      const nonexistent = await delta(createId());
      expect(rejected.statusCode).toBe(404);
      expect(rejected.json().error).toBe("item_not_found");
      expect(rejected.body).toBe(nonexistent.body);
      expect(
        await database.selectFrom("item_milestones").selectAll().execute(),
      ).toEqual(before);
      const failedCreate = await app.inject({
        method: "POST",
        url: "/api/milestones",
        headers: { cookie },
        payload: {
          name: "not inserted",
          startsOn: "2026-09-01",
          endsOn: "2026-09-01",
          blurb: null,
          itemIds: [visible, hidden],
        },
      });
      expect(failedCreate.body).toBe(rejected.body);
      expect(
        await database.selectFrom("milestones").select("name").execute(),
      ).toEqual([{ name: "occasion" }]);
    } finally {
      await close();
    }
  });
});
