import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { enqueueOrphanedUploadObjects } from "../../src/upload/enqueueOrphanedUploadObjects.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertPendingObjectDeletion,
  insertUploadFile,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

const createContext = async () => {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  /**
   * A row whose `storage_key` is the one a presign would have given it,
   * unless the test says otherwise.
   */
  const seedFile = async (
    overrides: Partial<Database["upload_files"]> = {},
  ) => {
    const fileId = createId();
    const extension =
      overrides.declared_content_type === "video/quicktime" ? "mov" : "jpg";
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: fileId,
      state: "failed",
      storage_key: `uploads/${sessionId}/${fileId}/original.${extension}`,
      ...overrides,
    });
    return fileId;
  };
  const enqueue = async (fileIds: string[]) => {
    const files = await database
      .selectFrom("upload_files")
      .select([
        "id",
        "upload_session_id",
        "declared_content_type",
        "storage_key",
        "multipart_upload_id",
        "item_id",
      ])
      .where("id", "in", fileIds)
      .execute();
    await enqueueOrphanedUploadObjects({
      transaction: database,
      files,
      now: NOW,
    });
  };
  const readQueuedKeys = async () => {
    const rows = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .orderBy("storage_key")
      .execute();
    return rows.map((row) => {
      return row.storage_key;
    });
  };
  return { database, memberId, sessionId, seedFile, enqueue, readQueuedKeys };
};

describe("enqueueOrphanedUploadObjects", () => {
  it("queues a single-PUT original and every derivative a browser sends", async () => {
    const { database, sessionId, seedFile, enqueue, readQueuedKeys } =
      await createContext();
    const fileId = await seedFile();

    await enqueue([fileId]);

    expect(await readQueuedKeys()).toEqual(
      [
        `uploads/${sessionId}/${fileId}/original.jpg`,
        `uploads/${sessionId}/${fileId}/display.jpg`,
        `uploads/${sessionId}/${fileId}/thumb.jpg`,
        `uploads/${sessionId}/${fileId}/poster.jpg`,
      ].toSorted(),
    );
    const row = await database
      .selectFrom("pending_object_deletions")
      .select(["attempts", "last_error", "created_at", "last_attempted_at"])
      .where("storage_key", "like", "%/original.jpg")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      attempts: 0,
      last_error: null,
      created_at: NOW,
      last_attempted_at: null,
    });
    await database.destroy();
  });

  it("names a video original by its declared type's extension", async () => {
    const { database, sessionId, seedFile, enqueue, readQueuedKeys } =
      await createContext();
    const fileId = await seedFile({
      kind: "video",
      declared_content_type: "video/quicktime",
    });

    await enqueue([fileId]);

    expect(await readQueuedKeys()).toEqual(
      [
        `uploads/${sessionId}/${fileId}/original.mov`,
        `uploads/${sessionId}/${fileId}/display.jpg`,
        `uploads/${sessionId}/${fileId}/thumb.jpg`,
        `uploads/${sessionId}/${fileId}/poster.jpg`,
      ].toSorted(),
    );
    await database.destroy();
  });

  it("queues nothing for a row that never got a key: nothing could have landed", async () => {
    const { database, seedFile, enqueue, readQueuedKeys } =
      await createContext();
    const fileId = await seedFile({ storage_key: null });

    await enqueue([fileId]);

    expect(await readQueuedKeys()).toEqual([]);
    await database.destroy();
  });

  it("queues a multipart original's derivatives but not the original, which is aborted", async () => {
    const { database, sessionId, seedFile, enqueue, readQueuedKeys } =
      await createContext();
    const fileId = await seedFile({
      kind: "video",
      declared_content_type: "video/quicktime",
      multipart_upload_id: "multipart-upload-1",
    });

    await enqueue([fileId]);

    expect(await readQueuedKeys()).toEqual(
      [
        `uploads/${sessionId}/${fileId}/display.jpg`,
        `uploads/${sessionId}/${fileId}/thumb.jpg`,
        `uploads/${sessionId}/${fileId}/poster.jpg`,
      ].toSorted(),
    );
    await database.destroy();
  });

  it("queues nothing for a row an item already stands on", async () => {
    const { database, memberId, sessionId, seedFile, enqueue, readQueuedKeys } =
      await createContext();
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      upload_session_id: sessionId,
    });
    const fileId = await seedFile({ state: "done", item_id: itemId });

    await enqueue([fileId]);

    expect(await readQueuedKeys()).toEqual([]);
    await database.destroy();
  });

  it("keeps one row for a key that is already queued, and does not fail", async () => {
    const { database, sessionId, seedFile, enqueue } = await createContext();
    const fileId = await seedFile();
    const originalKey = `uploads/${sessionId}/${fileId}/original.jpg`;
    await insertPendingObjectDeletion(database, {
      storageKey: originalKey,
      attempts: 3,
    });

    await enqueue([fileId]);
    await enqueue([fileId]);

    const rows = await database
      .selectFrom("pending_object_deletions")
      .select(["storage_key", "attempts"])
      .where("storage_key", "=", originalKey)
      .execute();
    expect(rows).toEqual([{ storage_key: originalKey, attempts: 3 }]);
    await database.destroy();
  });

  it("does nothing for no rows", async () => {
    const { database, readQueuedKeys } = await createContext();

    await enqueueOrphanedUploadObjects({
      transaction: database,
      files: [],
      now: NOW,
    });

    expect(await readQueuedKeys()).toEqual([]);
    await database.destroy();
  });
});
