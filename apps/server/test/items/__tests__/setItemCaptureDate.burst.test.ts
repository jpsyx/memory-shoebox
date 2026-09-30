import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { getVisibleItemOr404 } from "../../../src/items/getVisibleItemOr404.ts";
import { setItemCaptureDate } from "../../../src/items/setItemCaptureDate.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import {
  NOW,
  insertBurst,
  insertItem,
  insertMember,
  insertUploadSession,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { CAPTURED } from "./setItemCaptureDateTestHelpers.ts";

describe("a corrected frame and the burst it was in", () => {
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
      viewer: makeViewer({ memberId }),
      item: await getVisibleItemOr404({
        database,
        viewer: makeViewer({ memberId }),
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
});
