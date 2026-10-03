import { describe, expect, it } from "vitest";
import {
  createMilestoneResponseSchema,
  listMilestonesResponseSchema,
} from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("milestone CRUD", () => {
  it("creates empty and selected occasions with explicit dates, duplicate names, and outside-span counts", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const itemId = await insertItem(database, { uploadedBy: memberId });
      const body = {
        name: " Occasion ",
        startsOn: "2026-09-01",
        endsOn: "2026-09-03",
        blurb: " ",
      };
      const empty = await app.inject({
        method: "POST",
        url: "/api/milestones",
        headers: { cookie },
        payload: body,
      });
      expect(empty.statusCode).toBe(201);
      expect(createMilestoneResponseSchema.parse(empty.json())).toMatchObject({
        itemCount: 0,
        dayCount: 3,
        mismatchCount: 0,
        milestone: {
          name: "Occasion",
          startsOn: body.startsOn,
          endsOn: body.endsOn,
          blurb: null,
        },
        createdBy: { memberId },
      });
      const selected = await app.inject({
        method: "POST",
        url: "/api/milestones",
        headers: { cookie },
        payload: { ...body, itemIds: [itemId] },
      });
      expect(selected.statusCode).toBe(201);
      expect(selected.json()).toMatchObject({
        itemCount: 1,
        mismatchCount: 1,
        milestone: { startsOn: body.startsOn, endsOn: body.endsOn },
      });
      expect(
        await database.selectFrom("item_milestones").selectAll().execute(),
      ).toMatchObject([
        {
          attached_by: memberId,
          attached_at: NOW,
          span_mismatch_acknowledged_at: null,
        },
      ]);
    } finally {
      await close();
    }
  });

  it("pages equal starts by ID descending and filters overlapping spans", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie } = await insertSignedInMember({ database });
      const first = await insertMilestone(database, {
        name: "A",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
      });
      const second = await insertMilestone(database, {
        name: "B",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
      });
      await insertMilestone(database, {
        name: "excluded",
        startsOn: "2026-08-01",
      });
      const firstPage = await app.inject({
        url: "/api/milestones?from=2026-09-15&to=2026-09-16&limit=1",
        headers: { cookie },
      });
      expect(firstPage.statusCode).toBe(200);
      const parsed = listMilestonesResponseSchema.parse(firstPage.json());
      expect(
        parsed.milestones.map((row) => {
          return row.milestone.milestoneId;
        }),
      ).toEqual([second]);
      expect(parsed.nextCursor).toBeTypeOf("string");
      const secondPage = await app.inject({
        url: `/api/milestones?from=2026-09-15&to=2026-09-16&limit=1&cursor=${parsed.nextCursor}`,
        headers: { cookie },
      });
      expect(
        secondPage
          .json()
          .milestones.map((row: { milestone: { milestoneId: string } }) => {
            return row.milestone.milestoneId;
          }),
      ).toEqual([first]);
      expect(secondPage.json().nextCursor).toBeNull();
    } finally {
      await close();
    }
  });

  it("hides restricted attachment counts and retains null or another creator metadata", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie } = await insertSignedInMember({
        database,
        member: { role: "viewer" },
      });
      const creator = await insertMember(database);
      const milestoneId = await insertMilestone(database, {
        name: "All members",
        startsOn: "2026-09-01",
        created_by: creator,
      });
      const rule = await insertVisibilityRule(database, { mode: "only" });
      const hidden = await insertItem(database, {
        uploadedBy: creator,
        visibility_rule_id: rule,
      });
      const visible = await insertItem(database, {
        uploadedBy: creator,
        seq: 1,
      });
      await insertItemMilestone(database, { milestoneId, itemId: hidden });
      await insertItemMilestone(database, { milestoneId, itemId: visible });
      const detail = await app.inject({
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        itemCount: 1,
        mismatchCount: 1,
        canEdit: false,
        canDelete: false,
        createdBy: { memberId: creator },
      });
      await database
        .updateTable("milestones")
        .set({ created_by: null })
        .where("id", "=", milestoneId)
        .execute();
      const withoutCreator = await app.inject({
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
      });
      expect(withoutCreator.json().createdBy).toBeNull();
    } finally {
      await close();
    }
  });

  it("validates merged spans and clears acknowledgements only for actual date changes", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "Other creator",
        startsOn: "2026-09-01",
        endsOn: "2026-09-03",
      });
      const itemId = await insertItem(database, { uploadedBy: memberId });
      await insertItemMilestone(database, {
        milestoneId,
        itemId,
        span_mismatch_acknowledged_at: NOW,
      });
      const patch = (payload: object) => {
        return app.inject({
          method: "PATCH",
          url: `/api/milestones/${milestoneId}`,
          headers: { cookie },
          payload,
        });
      };
      const renamed = await patch({
        name: "Renamed",
        blurb: "Updated",
        startsOn: "2026-09-01",
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().mismatchCount).toBe(0);
      const rejected = await patch({ startsOn: "2026-09-04" });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().details.fieldErrors.endsOn).toBeDefined();
      expect(
        (await database.selectFrom("item_milestones").selectAll().execute())[0]
          ?.span_mismatch_acknowledged_at,
      ).toBe(NOW);
      const itemsBefore = await database
        .selectFrom("items")
        .selectAll()
        .execute();
      const changed = await patch({ endsOn: "2026-09-05" });
      expect(changed.json().mismatchCount).toBe(1);
      expect(
        (await database.selectFrom("item_milestones").selectAll().execute())[0]
          ?.span_mismatch_acknowledged_at,
      ).toBeNull();
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

  it("deletes only joins, returning visible count and auditing the true count", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const other = await insertMember(database);
      const milestoneId = await insertMilestone(database, {
        name: "Deleted occasion",
        startsOn: "2026-09-01",
        endsOn: "2026-09-03",
      });
      const hiddenRule = await insertVisibilityRule(database, { mode: "only" });
      const visible = await insertItem(database, { uploadedBy: memberId });
      const hidden = await insertItem(database, {
        uploadedBy: other,
        visibility_rule_id: hiddenRule,
        seq: 1,
      });
      await insertItemMilestone(database, { milestoneId, itemId: visible });
      await insertItemMilestone(database, { milestoneId, itemId: hidden });
      const before = await database.selectFrom("items").selectAll().execute();
      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toEqual({
        milestoneId,
        name: "Deleted occasion",
        detachedItemCount: 1,
      });
      expect(await database.selectFrom("items").selectAll().execute()).toEqual(
        before,
      );
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .selectAll()
          .execute(),
      ).toEqual([]);
      expect(
        await database.selectFrom("item_milestones").selectAll().execute(),
      ).toEqual([]);
      const events = await database
        .selectFrom("activity_events")
        .selectAll()
        .execute();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "milestone_deleted",
        actor_member_id: memberId,
        actor_label: "Abuela Rosa",
        subject_kind: "milestone",
        subject_id: milestoneId,
        subject_label: "Deleted occasion",
      });
      expect(JSON.parse(events[0]!.detail_json!)).toEqual({
        startsOn: "2026-09-01",
        endsOn: "2026-09-03",
        attachmentCount: 2,
      });
    } finally {
      await close();
    }
  });

  it("keeps detail and list query counts flat from one to forty attachments and occasions", async () => {
    const counting = makeQueryCountingDatabaseFromDatabase(
      createDatabase(":memory:"),
    );
    const { app, database, close } = await createTestApp({
      database: counting.database,
      clock: () => {
        return new Date(NOW);
      },
    });
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-09-01",
      });
      const first = await insertItem(database, { uploadedBy: memberId });
      await insertItemMilestone(database, { milestoneId, itemId: first });
      // Warm the authentication cache and slide before measuring reads.
      await app.inject({
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
      });
      const countQueries = async (url: string) => {
        counting.reset();
        const response = await app.inject({ url, headers: { cookie } });
        expect(response.statusCode).toBe(200);
        return counting.getQueryCount();
      };
      const oneDetail = await countQueries(`/api/milestones/${milestoneId}`);
      const oneList = await countQueries("/api/milestones");
      await Array.from({ length: 39 }, (_, index) => {
        return index + 1;
      }).reduce(async (previous, index) => {
        await previous;
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq: index,
        });
        await insertItemMilestone(database, { milestoneId, itemId });
        await insertMilestone(database, {
          name: `occasion ${index}`,
          startsOn: "2026-09-01",
        });
      }, Promise.resolve());
      expect(await countQueries(`/api/milestones/${milestoneId}`)).toBe(
        oneDetail,
      );
      expect(await countQueries("/api/milestones")).toBe(oneList);
      const response = await app.inject({
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
      });
      expect(response.json()).toMatchObject({
        itemCount: 40,
        mismatchCount: 40,
      });
    } finally {
      await close();
    }
  });
});
