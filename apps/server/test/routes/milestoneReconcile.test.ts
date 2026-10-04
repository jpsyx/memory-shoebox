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
  insertInstanceSetting,
  insertBurst,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("milestone reconciliation boundary", () => {
  it.each(["2026-11-01T06:30:00.000Z", "2026-11-01T06:30:00.123Z"])(
    "preserves the exact repeated DST instant %s on a day-only no-op",
    async (capturedAt) => {
      const { app, database, close } = await createTestApp();
      try {
        const { cookie, memberId } = await insertSignedInMember({ database });
        await insertInstanceSetting(database, {
          key: "shoebox.timezone",
          value: "America/New_York",
        });
        const milestoneId = await insertMilestone(database, {
          name: "Fallback",
          startsOn: "2026-11-01",
        });
        const uploadSessionId = await insertUploadSession(database, {
          uploadedBy: memberId,
        });
        const burstId = await insertBurst(database, {
          uploadSessionId,
          capturedOn: "2026-11-01",
        });
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          captured_at: capturedAt,
          captured_on: "2026-11-01",
          captured_at_offset_minutes: null,
          original_captured_at: capturedAt,
          burst_id: burstId,
          burst_index: 7,
        });
        await insertItemMilestone(database, { itemId, milestoneId });
        const response = await app.inject({
          method: "POST",
          url: `/api/milestones/${milestoneId}/reconcile`,
          headers: { cookie },
          payload: {
            mode: "move",
            moves: [{ itemId, targetOn: "2026-11-01" }],
          },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          movedCount: 0,
          raisedElsewhere: [],
        });
        expect(
          await database
            .selectFrom("items")
            .selectAll()
            .where("id", "=", itemId)
            .executeTakeFirstOrThrow(),
        ).toMatchObject({
          captured_at: capturedAt,
          captured_on: "2026-11-01",
          captured_at_offset_minutes: null,
          original_captured_at: capturedAt,
          capture_source: "exif",
          burst_id: burstId,
          burst_index: 7,
        });
        expect(
          await database
            .selectFrom("item_capture_date_changes")
            .selectAll()
            .execute(),
        ).toEqual([]);
        expect(
          await database.selectFrom("bursts").select("id").execute(),
        ).toEqual([{ id: burstId }]);
      } finally {
        await close();
      }
    },
  );

  it("moves an attachment with reconciliation history and counts only actual moves", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-09-20",
      });
      const itemId = await insertItem(database, { uploadedBy: memberId });
      await insertItemMilestone(database, { itemId, milestoneId });
      const move = () => {
        return app.inject({
          method: "POST",
          url: `/api/milestones/${milestoneId}/reconcile`,
          headers: { cookie },
          payload: {
            mode: "move",
            moves: [{ itemId, targetOn: "2026-09-20" }],
          },
        });
      };
      const response = await move();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        movedCount: 1,
        acknowledgedCount: 0,
        mismatchCount: 0,
        raisedElsewhere: [],
      });
      const history = await database
        .selectFrom("item_capture_date_changes")
        .selectAll()
        .execute();
      expect(history).toMatchObject([
        {
          reason: "milestone_reconcile",
          milestone_id: milestoneId,
          previous_captured_at: NOW,
          previous_capture_date: "2026-09-27",
          previous_capture_source: "exif",
        },
      ]);
      expect((await move()).json()).toMatchObject({ movedCount: 0 });
      expect(
        await database
          .selectFrom("item_capture_date_changes")
          .selectAll()
          .execute(),
      ).toEqual(history);
    } finally {
      await close();
    }
  });

  it("validates visibility and attachment membership across the whole batch before writing", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-09-20",
      });
      const attached = await insertItem(database, { uploadedBy: memberId });
      await insertItemMilestone(database, { itemId: attached, milestoneId });
      const unattached = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
      });
      const other = await insertMember(database);
      const rule = await insertVisibilityRule(database, { mode: "only" });
      const hidden = await insertItem(database, {
        uploadedBy: other,
        seq: 2,
        visibility_rule_id: rule,
      });
      const before = await database.selectFrom("items").selectAll().execute();
      const move = (itemId: string, targetOn = "2026-09-20") => {
        return app.inject({
          method: "POST",
          url: `/api/milestones/${milestoneId}/reconcile`,
          headers: { cookie },
          payload: {
            mode: "move",
            moves: [
              { itemId: attached, targetOn: "2026-09-20" },
              { itemId, targetOn },
            ],
          },
        });
      };
      const hiddenResponse = await move(hidden);
      expect(hiddenResponse.statusCode).toBe(404);
      expect(hiddenResponse.json().error).toBe("item_not_found");
      expect(hiddenResponse.body).toBe((await move(createId())).body);
      const missingAttachment = await move(unattached);
      expect(missingAttachment.statusCode).toBe(409);
      expect(missingAttachment.json().error).toBe(
        "milestone_attachment_missing",
      );
      await insertItemMilestone(database, { itemId: unattached, milestoneId });
      const outside = await move(unattached, "2026-09-21");
      expect(outside.statusCode).toBe(400);
      expect(
        outside.json().details.fieldErrors["moves.1.targetOn"],
      ).toBeDefined();
      expect(await database.selectFrom("items").selectAll().execute()).toEqual(
        before,
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

  it("preserves the first acknowledgement timestamp and rejects viewer mutations", async () => {
    const { app, database, close } = await createTestApp();
    try {
      const { cookie, memberId } = await insertSignedInMember({ database });
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-09-20",
      });
      const first = await insertItem(database, { uploadedBy: memberId });
      const second = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
      });
      const original = "2026-09-01T00:00:00.000Z";
      await insertItemMilestone(database, {
        itemId: first,
        milestoneId,
        span_mismatch_acknowledged_at: original,
      });
      await insertItemMilestone(database, { itemId: second, milestoneId });
      const request = {
        method: "POST" as const,
        url: `/api/milestones/${milestoneId}/reconcile`,
        headers: { cookie },
        payload: { mode: "acknowledge", itemIds: [first, second] },
      };
      expect((await app.inject(request)).json()).toMatchObject({
        acknowledgedCount: 1,
        movedCount: 0,
        mismatchCount: 0,
      });
      expect((await app.inject(request)).json()).toMatchObject({
        acknowledgedCount: 0,
      });
      expect(
        await database
          .selectFrom("item_milestones")
          .select("span_mismatch_acknowledged_at")
          .where("item_id", "=", first)
          .executeTakeFirstOrThrow(),
      ).toEqual({ span_mismatch_acknowledged_at: original });
      expect(
        await database
          .selectFrom("item_capture_date_changes")
          .selectAll()
          .execute(),
      ).toEqual([]);
      const viewer = await insertSignedInMember({
        database,
        token: "viewer",
        member: { role: "viewer" },
      });
      expect(
        (await app.inject({ ...request, headers: { cookie: viewer.cookie } }))
          .statusCode,
      ).toBe(403);
      expect((await app.inject({ ...request, headers: {} })).statusCode).toBe(
        401,
      );
    } finally {
      await close();
    }
  });
});
