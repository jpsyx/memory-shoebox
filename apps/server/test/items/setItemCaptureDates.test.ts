import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { setItemCaptureDates } from "../../src/items/setItemCaptureDates.ts";
import { makeViewer } from "../helpers/makeViewer.ts";
import {
  insertItem,
  insertMember,
  insertMilestone,
  insertBurst,
  insertUploadSession,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

describe("shared batch capture changes", () => {
  it("preserves fixed clocks and unknown-offset DST clocks with attributed history and original facts", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const memberId = await insertMember(database);
      const viewer = makeViewer({ memberId });
      const milestoneId = await insertMilestone(database, {
        name: "occasion",
        startsOn: "2026-03-30",
      });
      const fixed = await insertItem(database, {
        uploadedBy: memberId,
        captured_at: "2026-03-28T05:41:32.000Z",
        captured_on: "2026-03-28",
        captured_at_offset_minutes: 60,
        original_captured_at: "2026-03-28T05:41:32.000Z",
      });
      const unknown = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
        captured_at: "2026-03-28T05:41:32.000Z",
        captured_on: "2026-03-28",
        captured_at_offset_minutes: null,
        original_captured_at: "2026-03-28T05:41:32.000Z",
      });
      const read = (itemId: string) => {
        return getVisibleItemOr404({ database, viewer, itemId });
      };
      const changes = await setItemCaptureDates({
        transaction: database,
        viewer,
        timezone: "Europe/Madrid",
        now: NOW,
        changes: [
          {
            item: await read(fixed),
            capturedOn: "2026-03-30",
            capturedTime: undefined,
            reason: "manual",
            milestoneId: null,
          },
          {
            item: await read(unknown),
            capturedOn: "2026-03-30",
            capturedTime: undefined,
            reason: "milestone_reconcile",
            milestoneId,
          },
        ],
      });
      expect(changes.get(fixed)?.capturedAt).toBe("2026-03-30T05:41:32.000Z");
      expect(changes.get(unknown)?.capturedAt).toBe("2026-03-30T04:41:32.000Z");
      const rows = await database.selectFrom("items").selectAll().execute();
      expect(
        rows.find((row) => {
          return row.id === fixed;
        }),
      ).toMatchObject({
        captured_at_offset_minutes: 60,
        original_captured_at: "2026-03-28T05:41:32.000Z",
        capture_source: "uploader_set",
      });
      expect(
        rows.find((row) => {
          return row.id === unknown;
        }),
      ).toMatchObject({
        captured_at_offset_minutes: null,
        original_captured_at: "2026-03-28T05:41:32.000Z",
        capture_source: "uploader_set",
      });
      const history = await database
        .selectFrom("item_capture_date_changes")
        .selectAll()
        .execute();
      expect(history).toHaveLength(2);
      expect(
        history.find((row) => {
          return row.item_id === unknown;
        }),
      ).toMatchObject({
        reason: "milestone_reconcile",
        milestone_id: milestoneId,
        previous_captured_at: "2026-03-28T05:41:32.000Z",
        previous_capture_date: "2026-03-28",
        previous_capture_source: "exif",
      });
      expect(
        history.find((row) => {
          return row.item_id === fixed;
        }),
      ).toMatchObject({ reason: "manual", milestone_id: null });
    } finally {
      await database.destroy();
    }
  });

  it("deletes only empty bursts and keeps invisible survivors and their indexes", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    try {
      const memberId = await insertMember(database);
      const other = await insertMember(database);
      const viewer = makeViewer({ memberId });
      const uploadSessionId = await insertUploadSession(database, {
        uploadedBy: memberId,
      });
      const shared = await insertBurst(database, {
        uploadSessionId,
        capturedOn: "2026-09-27",
      });
      const empty = await insertBurst(database, {
        uploadSessionId,
        capturedOn: "2026-09-27",
      });
      const first = await insertItem(database, {
        uploadedBy: memberId,
        burst_id: shared,
        burst_index: 0,
      });
      const second = await insertItem(database, {
        uploadedBy: memberId,
        seq: 1,
        burst_id: empty,
        burst_index: 0,
      });
      const rule = await insertVisibilityRule(database, { mode: "only" });
      const hidden = await insertItem(database, {
        uploadedBy: other,
        seq: 2,
        burst_id: shared,
        burst_index: 7,
        visibility_rule_id: rule,
      });
      const changes = [];
      for (const itemId of [first, second]) {
        changes.push({
          item: await getVisibleItemOr404({ database, viewer, itemId }),
          capturedOn: "2026-09-20",
          capturedTime: undefined,
          reason: "manual" as const,
          milestoneId: null,
        });
      }
      const results = await setItemCaptureDates({
        transaction: database,
        viewer,
        changes,
        timezone: "Europe/Madrid",
        now: NOW,
      });
      expect([...results.values()]).toMatchObject([
        { burstId: null, burstIndex: null },
        { burstId: null, burstIndex: null },
      ]);
      expect(
        await database.selectFrom("bursts").select("id").execute(),
      ).toEqual([{ id: shared }]);
      expect(
        await database
          .selectFrom("items")
          .select(["burst_id", "burst_index"])
          .where("id", "=", hidden)
          .executeTakeFirstOrThrow(),
      ).toEqual({ burst_id: shared, burst_index: 7 });
    } finally {
      await database.destroy();
    }
  });
});
