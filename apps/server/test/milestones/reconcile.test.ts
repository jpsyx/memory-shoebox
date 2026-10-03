import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { reconcileMilestone } from "../../src/milestones/reconcileMilestone.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import { makeQueryCountingDatabaseFromDatabase } from "../helpers/makeQueryCountingDatabaseFromDatabase.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertItemMilestone,
  insertVisibilityRule,
  insertUploadSession,
  insertBurst,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("milestone reconciliation batches", () => {
  it("rearms other spans and reports full visible mismatch counts, excluding hidden and acknowledged siblings", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const memberId = await insertMember(database);
      const viewer = makeViewer({ memberId });
      const milestoneId = await insertMilestone(database, {
        name: "target",
        startsOn: "2026-09-20",
      });
      const otherId = await insertMilestone(database, {
        name: "other",
        startsOn: "2026-09-27",
      });
      const untouchedId = await insertMilestone(database, {
        name: "still contains",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
      });
      const itemId = await insertItem(database, { uploadedBy: memberId });
      const acknowledgedAt = "2026-09-01T00:00:00.000Z";
      await insertItemMilestone(database, { itemId, milestoneId });
      await insertItemMilestone(database, {
        itemId,
        milestoneId: otherId,
        span_mismatch_acknowledged_at: acknowledgedAt,
      });
      await insertItemMilestone(database, {
        itemId,
        milestoneId: untouchedId,
        span_mismatch_acknowledged_at: acknowledgedAt,
      });
      const visible = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
        captured_on: "2026-09-19",
      });
      await insertItemMilestone(database, {
        itemId: visible,
        milestoneId: otherId,
      });
      const acknowledged = await insertItem(database, {
        uploadedBy: memberId,
        seq: 2,
        captured_on: "2026-09-19",
      });
      await insertItemMilestone(database, {
        itemId: acknowledged,
        milestoneId: otherId,
        span_mismatch_acknowledged_at: acknowledgedAt,
      });
      const rule = await insertVisibilityRule(database, { mode: "only" });
      const hidden = await insertItem(database, {
        uploadedBy: await insertMember(database),
        seq: 3,
        captured_on: "2026-09-19",
        visibility_rule_id: rule,
      });
      await insertItemMilestone(database, {
        itemId: hidden,
        milestoneId: otherId,
      });
      const result = await reconcileMilestone({
        transaction: database,
        viewer,
        milestoneId,
        now: NOW,
        body: { mode: "move", moves: [{ itemId, targetOn: "2026-09-20" }] },
      });
      expect(result.raisedElsewhere).toEqual([
        {
          milestone: {
            milestoneId: otherId,
            name: "other",
            startsOn: "2026-09-27",
            endsOn: "2026-09-27",
            blurb: null,
          },
          mismatchCount: 2,
        },
      ]);
      expect(
        await database
          .selectFrom("item_milestones")
          .select("span_mismatch_acknowledged_at")
          .where("item_id", "=", itemId)
          .where("milestone_id", "=", otherId)
          .executeTakeFirstOrThrow(),
      ).toEqual({ span_mismatch_acknowledged_at: null });
      expect(
        await database
          .selectFrom("item_milestones")
          .select("span_mismatch_acknowledged_at")
          .where("item_id", "=", itemId)
          .where("milestone_id", "=", untouchedId)
          .executeTakeFirstOrThrow(),
      ).toEqual({ span_mismatch_acknowledged_at: acknowledgedAt });
    } finally {
      await database.destroy();
    }
  });

  it("uses constant query counts for one versus 500 items, distinct bursts, and raised occasions", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const memberId = await insertMember(database);
      const viewer = makeViewer({ memberId });
      const milestoneId = await insertMilestone(database, {
        name: "target",
        startsOn: "2026-09-20",
      });
      const uploadSessionId = await insertUploadSession(database, {
        uploadedBy: memberId,
      });
      const moves = [];
      for (let index = 0; index < 501; index += 1) {
        const burstId = await insertBurst(database, {
          uploadSessionId,
          capturedOn: "2026-09-27",
        });
        const itemId = await insertItem(database, {
          uploadedBy: memberId,
          seq: index,
          burst_id: burstId,
          burst_index: 0,
        });
        await insertItemMilestone(database, { itemId, milestoneId });
        const otherId = await insertMilestone(database, {
          name: `other ${index}`,
          startsOn: "2026-09-27",
        });
        await insertItemMilestone(database, {
          itemId,
          milestoneId: otherId,
          span_mismatch_acknowledged_at: NOW,
        });
        moves.push({ itemId, targetOn: "2026-09-20" });
      }
      const counter = makeQueryCountingDatabaseFromDatabase(database);
      const context = {
        transaction: counter.database,
        viewer,
        milestoneId,
        now: NOW,
      };
      const small = await reconcileMilestone({
        ...context,
        body: { mode: "move", moves: moves.slice(0, 1) },
      });
      const smallCount = counter.getQueryCount();
      counter.reset();
      const large = await reconcileMilestone({
        ...context,
        body: { mode: "move", moves: moves.slice(1) },
      });
      expect(small.movedCount).toBe(1);
      expect(large.movedCount).toBe(500);
      expect(large.raisedElsewhere).toHaveLength(500);
      expect(counter.getQueryCount()).toBe(smallCount);
      expect(smallCount).toBeLessThan(20);
      expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
        [],
      );
    } finally {
      await database.destroy();
    }
  });
});
