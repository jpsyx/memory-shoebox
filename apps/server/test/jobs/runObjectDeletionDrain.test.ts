import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { runObjectDeletionDrain } from "../../src/jobs/runObjectDeletionDrain.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertPendingObjectDeletion,
  insertRendition,
  insertUploadFile,
  insertUploadSession,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return { database, b2: createFakeB2Client() };
}

/** What is still queued, in key order. */
async function _readQueuedKeys(
  database: Awaited<ReturnType<typeof _createContext>>["database"],
): Promise<string[]> {
  const rows = await database
    .selectFrom("pending_object_deletions")
    .select("storage_key")
    .orderBy("storage_key")
    .execute();
  return rows.map((row) => {
    return row.storage_key;
  });
}

/** One upload batch with one file row, and the key a presign gives it. */
async function _insertUploadFileWithKeys(
  context: Awaited<ReturnType<typeof _createContext>>,
  overrides: Partial<Database["upload_files"]>,
): Promise<{
  sessionId: string;
  fileId: string;
  keyOf: (name: string) => string;
}> {
  const memberId = await insertMember(context.database);
  const sessionId = await insertUploadSession(context.database, {
    uploadedBy: memberId,
  });
  const fileId = createId();
  await insertUploadFile(context.database, {
    uploadSessionId: sessionId,
    id: fileId,
    storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
    ...overrides,
  });
  return {
    sessionId,
    fileId,
    keyOf: (name) => {
      return `uploads/${sessionId}/${fileId}/${name}.jpg`;
    },
  };
}

describe("object-deletion-drain", () => {
  it("does nothing against an empty table", async () => {
    const { database, b2 } = await _createContext();

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(b2.deletedKeys).toEqual([]);
    await database.destroy();
  });

  it("deletes the object and then the row, and changes nothing on a second run", async () => {
    const { database, b2 } = await _createContext();
    await insertPendingObjectDeletion(database, {
      storageKey: "media/one.jpg",
    });

    const first = await runObjectDeletionDrain({ database, b2, now: NOW });
    const second = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(first).toEqual({ deletedCount: 1, failedCount: 0 });
    expect(second).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(b2.deletedKeys).toEqual(["media/one.jpg"]);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .execute(),
    ).toHaveLength(0);
    await database.destroy();
  });

  it("drops a queued key whose file was retried since, and deletes nothing", async () => {
    const context = await _createContext();
    const { database, b2 } = context;
    // The read of the batch came first, then a retry put the row back to
    // `waiting` and its keys are about to be written again.
    const file = await _insertUploadFileWithKeys(context, { state: "waiting" });
    await insertPendingObjectDeletion(database, {
      storageKey: file.keyOf("display"),
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(b2.deletedKeys).toEqual([]);
    expect(await _readQueuedKeys(database)).toEqual([]);
    await database.destroy();
  });

  it("drops a queued key an item's rendition now holds, and deletes nothing", async () => {
    const { database, b2 } = await _createContext();
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, {
      itemId,
      purpose: "original",
      storage_key: "uploads/a-session/a-file/original.jpg",
    });
    await insertPendingObjectDeletion(database, {
      storageKey: "uploads/a-session/a-file/original.jpg",
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(b2.deletedKeys).toEqual([]);
    expect(await _readQueuedKeys(database)).toEqual([]);
    await database.destroy();
  });

  it("still deletes the rest of the batch around a key it drops", async () => {
    const context = await _createContext();
    const { database, b2 } = context;
    b2.failingKeys.add("media/stuck.jpg");
    const file = await _insertUploadFileWithKeys(context, {
      state: "sending",
    });
    await insertPendingObjectDeletion(database, {
      storageKey: file.keyOf("original"),
      created_at: shiftMinutes({ instant: NOW, minutes: -4 }),
    });
    await insertPendingObjectDeletion(database, {
      storageKey: "media/fine.jpg",
      created_at: shiftMinutes({ instant: NOW, minutes: -3 }),
    });
    await insertPendingObjectDeletion(database, {
      storageKey: "media/stuck.jpg",
      created_at: shiftMinutes({ instant: NOW, minutes: -2 }),
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 1, failedCount: 1 });
    expect(b2.deletedKeys).toEqual(["media/fine.jpg"]);
    expect(await _readQueuedKeys(database)).toEqual(["media/stuck.jpg"]);
    await database.destroy();
  });

  it.each(["failed", "cancelled"] as const)(
    "deletes a queued key whose file is %s: nothing uses it",
    async (state) => {
      const context = await _createContext();
      const { database, b2 } = context;
      const file = await _insertUploadFileWithKeys(context, { state });
      await insertPendingObjectDeletion(database, {
        storageKey: file.keyOf("original"),
      });
      await insertPendingObjectDeletion(database, {
        storageKey: file.keyOf("thumb"),
      });

      const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

      expect(summary).toEqual({ deletedCount: 2, failedCount: 0 });
      expect(b2.deletedKeys.toSorted()).toEqual(
        [file.keyOf("original"), file.keyOf("thumb")].toSorted(),
      );
      await database.destroy();
    },
  );

  it("deletes a deleted item's keys, though its upload row is still done", async () => {
    const context = await _createContext();
    const { database, b2 } = context;
    // Deleting an item cascades its renditions away and sets the upload
    // row's `item_id` to null, leaving it `done`. The photograph's own keys
    // are exactly what the delete queued, and they must still go.
    const file = await _insertUploadFileWithKeys(context, {
      state: "done",
      item_id: null,
    });
    await insertPendingObjectDeletion(database, {
      storageKey: file.keyOf("original"),
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 1, failedCount: 0 });
    expect(b2.deletedKeys).toEqual([file.keyOf("original")]);
    await database.destroy();
  });

  it("deletes an upload-shaped key that names no row at all", async () => {
    const { database, b2 } = await _createContext();
    await insertPendingObjectDeletion(database, {
      storageKey: `uploads/${createId()}/${createId()}/display.jpg`,
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 1, failedCount: 0 });
    await database.destroy();
  });

  it("keeps the row and records the failure when Backblaze refuses", async () => {
    const { database, b2 } = await _createContext();
    b2.failingKeys.add("media/stuck.jpg");
    await insertPendingObjectDeletion(database, {
      storageKey: "media/stuck.jpg",
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 0, failedCount: 1 });
    const row = await database
      .selectFrom("pending_object_deletions")
      .select(["attempts", "last_error", "last_attempted_at"])
      .executeTakeFirstOrThrow();
    expect(row.attempts).toBe(1);
    expect(row.last_error).toContain("stuck.jpg");
    expect(row.last_attempted_at).toBe(NOW);
    await database.destroy();
  });

  it("keeps draining after one key fails", async () => {
    const { database, b2 } = await _createContext();
    b2.failingKeys.add("media/stuck.jpg");
    await insertPendingObjectDeletion(database, {
      storageKey: "media/stuck.jpg",
    });
    await insertPendingObjectDeletion(database, {
      storageKey: "media/fine.jpg",
    });

    const summary = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(summary).toEqual({ deletedCount: 1, failedCount: 1 });
    expect(b2.deletedKeys).toEqual(["media/fine.jpg"]);
    await database.destroy();
  });

  it("does not let a full batch of stuck keys starve a newer one", async () => {
    const { database, b2 } = await _createContext();
    // One full batch of keys that will never delete, every one of them older
    // than the key behind them.
    for (let index = 0; index < 100; index += 1) {
      const key = `media/stuck-${index}.jpg`;
      b2.failingKeys.add(key);
      await insertPendingObjectDeletion(database, {
        storageKey: key,
        created_at: shiftMinutes({ instant: NOW, minutes: -60 }),
      });
    }
    await insertPendingObjectDeletion(database, {
      storageKey: "media/fine.jpg",
      created_at: shiftMinutes({ instant: NOW, minutes: -1 }),
    });

    await runObjectDeletionDrain({
      database,
      b2,
      now: shiftMinutes({ instant: NOW, minutes: -30 }),
    });
    const second = await runObjectDeletionDrain({ database, b2, now: NOW });

    expect(b2.deletedKeys).toEqual(["media/fine.jpg"]);
    expect(second.deletedCount).toBe(1);
    await database.destroy();
  });
});
