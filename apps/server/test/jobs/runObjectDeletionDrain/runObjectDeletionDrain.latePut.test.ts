import { describe, expect, it } from "vitest";
import { createId } from "../../../src/db/createId.ts";
import { runObjectDeletionDrain } from "../../../src/jobs/runObjectDeletionDrain.ts";
import { createTestApp } from "../../helpers/createTestApp.ts";
import {
  insertPendingObjectDeletion,
  insertUploadFile,
  NOW,
  shiftMinutes,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { setUpUploadTestContext } from "../../routes/uploadCommit/__tests__/setUpUploadTestContext.ts";

describe("late PUT cleanup", () => {
  it.each(["original", "display", "thumb", "poster"])(
    "keeps a durable tombstone for a cancelled file's late %s PUT",
    async (purpose) => {
      const context = await setUpUploadTestContext({
        state: "uploading",
        committed_at: NOW,
      });
      const { database, b2, sessionId, commit } = context;
      const fileId = createId();
      const storageKey = `uploads/${sessionId}/${fileId}/${purpose}.jpg`;
      await insertUploadFile(database, {
        uploadSessionId: sessionId,
        id: fileId,
        state: "sending",
        storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
        content_hash: "a".repeat(64),
        presigned_until: shiftMinutes({ instant: NOW, minutes: 60 }),
      });
      const closed = await commit({ intent: "close" });
      expect(closed.statusCode).toBe(200);
      await b2.putObject({
        key: storageKey,
        body: new Uint8Array([1]),
        contentType: "image/jpeg",
      });

      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 5 }),
      });

      expect(b2.storedObjects.has(storageKey)).toBe(false);
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .select("id")
          .execute(),
      ).toHaveLength(4);
      // The previously signed request lands after the first cleanup pass.
      await b2.putObject({
        key: storageKey,
        body: new Uint8Array([2]),
        contentType: "image/jpeg",
      });
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 35 }),
      });
      expect(b2.storedObjects.has(storageKey)).toBe(true);
      // A request begun just before URL expiry may finish another hour later.
      await b2.putObject({
        key: storageKey,
        body: new Uint8Array([3]),
        contentType: "image/jpeg",
      });
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 60 }),
      });
      expect(b2.storedObjects.has(storageKey)).toBe(true);
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .select("id")
          .execute(),
      ).toHaveLength(4);
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 120 }),
      });
      expect(b2.storedObjects.has(storageKey)).toBe(false);
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .select("id")
          .execute(),
      ).toHaveLength(4);
      const deletionsAfterSettling = b2.deletedKeys.length;
      // Frozen tabs and other clients may finish after the browser deadline.
      await b2.putObject({
        key: storageKey,
        body: new Uint8Array([4]),
        contentType: "image/jpeg",
      });
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 1559 }),
      });
      expect(b2.storedObjects.has(storageKey)).toBe(true);
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 1560 }),
      });
      expect(b2.storedObjects.has(storageKey)).toBe(false);
      expect(b2.deletedKeys).toHaveLength(deletionsAfterSettling + 1);
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 3000 }),
      });
      // HEAD's not-found answer avoids adding another S3 hide marker.
      expect(b2.deletedKeys).toHaveLength(deletionsAfterSettling + 1);
      expect(b2.calls).toContain("headObject");
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .select("id")
          .execute(),
      ).toHaveLength(4);
      await context.close();
    },
  );

  it("keeps a full batch of retained upload keys from starving a newer deletion", async () => {
    const context = await createTestApp();
    const { database, b2 } = context;
    await Promise.all(
      Array.from({ length: 100 }, () => {
        return insertPendingObjectDeletion(database, {
          storageKey: `uploads/${createId()}/${createId()}/original.jpg`,
        });
      }),
    );
    await runObjectDeletionDrain({ database, b2, now: NOW });
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .execute(),
    ).toHaveLength(100);
    await insertPendingObjectDeletion(database, {
      storageKey: "media/newer.jpg",
      created_at: shiftMinutes({ instant: NOW, minutes: 1 }),
    });

    await runObjectDeletionDrain({
      database,
      b2,
      now: shiftMinutes({ instant: NOW, minutes: 5 }),
    });

    expect(b2.deletedKeys).toContain("media/newer.jpg");
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select("id")
        .where("storage_key", "=", "media/newer.jpg")
        .execute(),
    ).toEqual([]);
    await runObjectDeletionDrain({
      database,
      b2,
      now: shiftMinutes({ instant: NOW, minutes: 120 }),
    });
    await insertPendingObjectDeletion(database, {
      storageKey: "media/after-settling.jpg",
      created_at: shiftMinutes({ instant: NOW, minutes: 121 }),
    });
    const callsBefore = b2.calls.length;
    await runObjectDeletionDrain({
      database,
      b2,
      now: shiftMinutes({ instant: NOW, minutes: 125 }),
    });
    expect(b2.deletedKeys).toContain("media/after-settling.jpg");
    expect(b2.calls.slice(callsBefore)).toEqual(["deleteObject"]);
    await context.close();
  });

  it("retries a tombstone HEAD failure on the next drain rather than waiting a day", async () => {
    const context = await createTestApp();
    const { database, b2 } = context;
    await insertPendingObjectDeletion(database, {
      storageKey: `uploads/${createId()}/${createId()}/original.jpg`,
    });
    await runObjectDeletionDrain({ database, b2, now: NOW });
    b2.isUnavailable = true;
    expect(
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 120 }),
      }),
    ).toEqual({ deletedCount: 0, failedCount: 1 });
    b2.isUnavailable = false;
    expect(
      await runObjectDeletionDrain({
        database,
        b2,
        now: shiftMinutes({ instant: NOW, minutes: 125 }),
      }),
    ).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .select(["attempts", "last_error", "last_attempted_at"])
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      attempts: 1,
      last_error: null,
      last_attempted_at: shiftMinutes({ instant: NOW, minutes: 125 }),
    });
    await context.close();
  });
});
