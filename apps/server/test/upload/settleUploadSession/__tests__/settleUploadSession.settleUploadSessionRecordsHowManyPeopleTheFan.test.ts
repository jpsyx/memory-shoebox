import {
  createContext,
  settle,
  insertSettleableBurst,
} from "./settleUploadSessionTestHelpers.ts";

import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../../src/db/client.ts";
import { migrateToLatest } from "../../../../src/db/migrate.ts";

import {
  NOW,
  insertItem,
  insertMember,
  insertUploadFile,
  insertUploadSession,
} from "../../../helpers/seedHelpers/seedHelpers.ts";

describe("settleUploadSession", () => {
  it("records how many people the fan-out wrote to, and when", async () => {
    const { database, uploaderId } = await createContext();
    const { sessionId } = await insertSettleableBurst({
      database,
      uploaderId,
    });

    await settle({ database, sessionId });

    const session = await database
      .selectFrom("upload_sessions")
      .select(["state", "settled_at", "notified_member_count", "notified_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({
      state: "settled",
      settled_at: NOW,
      notified_member_count: 1,
      notified_at: NOW,
    });
    await database.destroy();
  });

  it("settles a batch nobody else can see with a count of zero", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "failed",
    });

    expect(await settle({ database, sessionId })).toBe(true);

    const session = await database
      .selectFrom("upload_sessions")
      .select(["notified_member_count", "notified_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toEqual({ notified_member_count: 0, notified_at: NOW });
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toEqual([]);
    await database.destroy();
  });

  it("forms bursts only among items a camera dated, never from an invented clock", async () => {
    const { database, uploaderId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "done",
    });
    let seq = 0;
    const insertFrame = (options: {
      captureSource: string;
      capturedAt: string;
      kind?: "photo" | "video";
    }): Promise<string> => {
      seq += 1;
      const { kind = "photo" } = options;
      return insertItem(database, {
        uploadedBy: uploaderId,
        upload_session_id: sessionId,
        captured_on: "2026-09-14",
        captured_at: options.capturedAt,
        capture_source: options.captureSource,
        kind: kind,
        seq,
      });
    };

    // A camera run: two photographs and a video, inside the gap.
    const cameraItemIds = [
      await insertFrame({
        captureSource: "exif",
        capturedAt: "2026-09-14T06:41:00.000Z",
      }),
      await insertFrame({
        captureSource: "exif",
        capturedAt: "2026-09-14T06:41:04.000Z",
      }),
      await insertFrame({
        captureSource: "video_metadata",
        capturedAt: "2026-09-14T06:41:08.000Z",
        kind: "video",
      }),
    ];
    // Two files per invented clock, all sharing one instant that sits inside
    // the camera run's gap, so a missing filter would pull them into it.
    const inventedItemIds: string[] = [];
    for (const captureSource of [
      "upload_time",
      "file_mtime",
      "filename",
      "uploader_set",
    ]) {
      for (const _copy of [0, 1]) {
        inventedItemIds.push(
          await insertFrame({
            captureSource,
            capturedAt: "2026-09-14T06:41:06.000Z",
          }),
        );
      }
    }

    expect(await settle({ database, sessionId })).toBe(true);

    const bursts = await database.selectFrom("bursts").selectAll().execute();
    expect(bursts).toHaveLength(1);
    const burstedItems = await database
      .selectFrom("items")
      .select("id")
      .where("burst_id", "=", bursts[0]?.id ?? "")
      .orderBy("burst_index")
      .execute();
    expect(burstedItems).toEqual(
      cameraItemIds.map((itemId) => {
        return { id: itemId };
      }),
    );
    const inventedItems = await database
      .selectFrom("items")
      .select(["burst_id", "burst_index"])
      .where("id", "in", inventedItemIds)
      .execute();
    expect(inventedItems).toHaveLength(inventedItemIds.length);
    inventedItems.forEach((inventedItem) => {
      expect(inventedItem).toEqual({ burst_id: null, burst_index: null });
    });
    await database.destroy();
  });

  it("writes no burst at all when every item's clock was invented", async () => {
    const { database, uploaderId } = await createContext();
    const sessionId = await insertUploadSession(database, {
      uploadedBy: uploaderId,
    });
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      state: "done",
    });
    for (const [index, captureSource] of [
      "upload_time",
      "upload_time",
      "file_mtime",
      "filename",
      "uploader_set",
    ].entries()) {
      await insertItem(database, {
        uploadedBy: uploaderId,
        upload_session_id: sessionId,
        captured_on: "2026-09-14",
        captured_at: "2026-09-14T06:41:00.000Z",
        capture_source: captureSource,
        seq: index,
      });
    }

    expect(await settle({ database, sessionId })).toBe(true);

    expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
      [],
    );
    const stamped = await database
      .selectFrom("items")
      .select("id")
      .where("burst_id", "is not", null)
      .execute();
    expect(stamped).toEqual([]);
    await database.destroy();
  });
});
