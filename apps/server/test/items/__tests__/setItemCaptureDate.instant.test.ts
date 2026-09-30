import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../../src/items/getVisibleItemOr404.ts";
import { setItemCaptureDate } from "../../../src/items/setItemCaptureDate.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import {
  NOW,
  insertItem,
  insertMember,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { CAPTURED } from "./setItemCaptureDateTestHelpers.ts";

describe("the instant a capture-date correction writes", () => {
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
