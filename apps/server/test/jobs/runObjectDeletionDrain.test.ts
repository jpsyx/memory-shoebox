import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runObjectDeletionDrain } from "../../src/jobs/runObjectDeletionDrain.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client.ts";
import {
  NOW,
  insertPendingObjectDeletion,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return { database, b2: createFakeB2Client() };
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
