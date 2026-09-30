import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { setItemCaptureDate } from "../../src/items/setItemCaptureDate.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import {
  insertBurst,
  insertItem,
  insertItemMilestone,
  insertMember,
  insertMilestone,
  insertUploadSession,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeViewer = (memberId: string): Viewer => {
  return {
    memberId,
    sessionId: createId(),
    role: "uploader",
    isAdmin: false,
    visibleRuleIds: ["visibility-rule-everyone"],
  };
};

/** The shape every test here starts from: 06:41 local, at +02:00. */
const CAPTURED = {
  captured_at: "2026-09-14T04:41:32.000Z",
  captured_at_offset_minutes: 120,
  captured_on: "2026-09-14",
  capture_source: "exif",
  original_captured_at: "2026-09-14T04:41:32.000Z",
} as const;

describe("setItemCaptureDate", () => {
  it("keeps the clock time, the offset and the original", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const row = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();

    expect(row.captured_at).toBe("2026-09-20T04:41:32.000Z");
    expect(row.captured_on).toBe("2026-09-20");
    // Moving a photograph to another day does not move the camera to another
    // country.
    expect(row.captured_at_offset_minutes).toBe(120);
    // Decision 10: "revert to what the file said" stays one step away.
    expect(row.original_captured_at).toBe("2026-09-14T04:41:32.000Z");
    // Ruling 2: how it was arrived at, which has no 'manual' member.
    expect(row.capture_source).toBe("uploader_set");
    await database.destroy();
  });

  it("writes one change row per moved item, with both sides of the move", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const changes = await database
      .selectFrom("item_capture_date_changes")
      .selectAll()
      .execute();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      item_id: itemId,
      // Null: this path is the hand correction, not a reconciliation.
      milestone_id: null,
      previous_captured_at: "2026-09-14T04:41:32.000Z",
      previous_capture_date: "2026-09-14",
      previous_capture_source: "exif",
      new_captured_at: "2026-09-20T04:41:32.000Z",
      new_capture_date: "2026-09-20",
      changed_by: memberId,
      changed_at: NOW,
      // Ruling 2 again, from the other side: why, never how.
      reason: "manual",
    });
    await database.destroy();
  });

  it("takes a replacement clock time when one is given", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: "18:05",
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const row = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();

    // 18:05 at the item's own +02:00, which the replacement clock does not
    // move either.
    expect(row.captured_at).toBe("2026-09-20T16:05:00.000Z");
    expect(row.captured_on).toBe("2026-09-20");
    expect(row.captured_at_offset_minutes).toBe(120);
    await database.destroy();
  });

  it("writes captured_on from the local day, not from the UTC instant", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      // A camera five hours behind UTC, whose late evening is the next day in
      // UTC. `date(captured_at)` would put this photograph a day out and
      // therefore under the wrong milestone.
      captured_at: "2026-09-15T04:30:00.000Z",
      captured_at_offset_minutes: -300,
      captured_on: "2026-09-14",
      capture_source: "exif",
      original_captured_at: "2026-09-15T04:30:00.000Z",
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const row = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();

    // 23:30 local on the 20th, which is 04:30 UTC on the 21st.
    expect(row.captured_at).toBe("2026-09-21T04:30:00.000Z");
    expect(row.captured_on).toBe("2026-09-20");
    await database.destroy();
  });

  it("ejects the item from its burst when it leaves the burst's day", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const movedId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
      burst_id: burstId,
      burst_index: 0,
      seq: 1,
    });
    const siblingId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
      burst_id: burstId,
      burst_index: 1,
      seq: 2,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId: movedId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const moved = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", movedId)
      .executeTakeFirstOrThrow();
    const sibling = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", siblingId)
      .executeTakeFirstOrThrow();

    // A burst is a same-day run by definition.
    expect(moved.burst_id).toBeNull();
    expect(moved.burst_index).toBeNull();
    // The other frames stay exactly where they are.
    expect(sibling.burst_id).toBe(burstId);
    expect(sibling.burst_index).toBe(1);
    expect(
      await database.selectFrom("bursts").selectAll().execute(),
    ).toHaveLength(1);
    await database.destroy();
  });

  it("drops the burst when the ejected frame was its last", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const onlyFrameId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
      burst_id: burstId,
      burst_index: 0,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId: onlyFrameId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    // No foreign key direction does this.
    expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
      [],
    );
    await database.destroy();
  });

  it("leaves the burst standing when the item stays on its day", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const uploadSessionId = await insertUploadSession(database, {
      uploadedBy: memberId,
    });
    const burstId = await insertBurst(database, {
      uploadSessionId,
      capturedOn: "2026-09-14",
    });
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
      burst_id: burstId,
      burst_index: 0,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      // The same day, an hour later: a correction, but not a departure.
      capturedOn: "2026-09-14",
      capturedTime: "07:41:32",
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const row = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();
    expect(row.captured_at).toBe("2026-09-14T05:41:32.000Z");
    expect(row.burst_id).toBe(burstId);
    expect(row.burst_index).toBe(0);
    expect(
      await database.selectFrom("bursts").selectAll().execute(),
    ).toHaveLength(1);
    await database.destroy();
  });

  it("re-arms the reconciliation only for spans that no longer contain it", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });
    const leftBehindId = await insertMilestone(database, {
      name: "The christening",
      startsOn: "2026-09-13",
      endsOn: "2026-09-15",
    });
    const stillHoldingId = await insertMilestone(database, {
      name: "September in Madrid",
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
    });
    await insertItemMilestone(database, {
      itemId,
      milestoneId: leftBehindId,
      span_mismatch_acknowledged_at: NOW,
    });
    await insertItemMilestone(database, {
      itemId,
      milestoneId: stillHoldingId,
      span_mismatch_acknowledged_at: NOW,
    });

    await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      capturedOn: "2026-09-20",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const rows = await database
      .selectFrom("item_milestones")
      .select([
        "item_milestones.milestone_id as milestoneId",
        "item_milestones.span_mismatch_acknowledged_at as acknowledgedAt",
      ])
      .execute();
    const acknowledgedBy = new Map(
      rows.map((row) => {
        return [row.milestoneId, row.acknowledgedAt];
      }),
    );

    // The existing reconciliation is offered again, rather than a new one
    // being invented.
    expect(acknowledgedBy.get(leftBehindId)).toBeNull();
    // The span still holds it, so a considered decision stands.
    expect(acknowledgedBy.get(stillHoldingId)).toBe(NOW);
    // Nothing is attached or detached here.
    expect(rows).toHaveLength(2);
    await database.destroy();
  });

  it("writes nothing at all when the instant does not change", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      ...CAPTURED,
    });

    const result = await setItemCaptureDate({
      transaction: database,
      viewer: makeViewer(memberId),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer(memberId),
        itemId,
      }),
      // The day it is already on, and the clock it is already at.
      capturedOn: "2026-09-14",
      capturedTime: undefined,
      timezone: "Europe/Madrid",
      now: NOW,
    });

    const row = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();

    expect(result.didChange).toBe(false);
    // A no-op is not a correction: `capture_source` would say 'uploader_set'
    // if anything had been written.
    expect(row.capture_source).toBe("exif");
    expect(row.captured_at).toBe("2026-09-14T04:41:32.000Z");
    expect(
      await database
        .selectFrom("item_capture_date_changes")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    await database.destroy();
  });
});
