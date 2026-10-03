import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { enqueueOrphanedUploadObjects } from "../../src/upload/enqueueOrphanedUploadObjectsHelpers.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertPendingObjectDeletion,
  insertUploadFile,
  insertUploadSession,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** Operations bound to one independently created upload fixture. */
type FixtureOperations = {
  seedFile: (overrides?: Partial<Database["upload_files"]>) => Promise<string>;
  enqueue: (fileIds: string[]) => Promise<void>;
  readQueuedKeys: () => Promise<string[]>;
};

/** seedFile using this fixture's catalog and request context. */
async function _seedFileForFixture(
  input: Readonly<{
    context: { database: Kysely<Database>; sessionId: string };
    argument?: Partial<Database["upload_files"]>;
  }>,
): Promise<string> {
  const { database, sessionId } = input.context;
  const overrides = input.argument ?? {};

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
}

/** enqueue using this fixture's catalog and request context. */
async function _enqueueForFixture(
  input: Readonly<{
    context: { database: Kysely<Database> };
    argument: string[];
  }>,
): Promise<void> {
  const { database } = input.context;
  const fileIds = input.argument;

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
}

/** readQueuedKeys using this fixture's catalog and request context. */
async function _readQueuedKeysForFixture(
  input: Readonly<{ context: { database: Kysely<Database> } }>,
): Promise<string[]> {
  const { database } = input.context;

  const rows = await database
    .selectFrom("pending_object_deletions")
    .select("storage_key")
    .orderBy("storage_key")
    .execute();
  return rows.map((row) => {
    return row.storage_key;
  });
}

/** Binds upload operations to one fixture without sharing live resources. */
function _makeOperationsFromFixtureContext(
  context: Readonly<{ database: Kysely<Database>; sessionId: string }>,
): FixtureOperations {
  const { database, sessionId } = context;
  const seedFile = (overrides: Partial<Database["upload_files"]> = {}) => {
    return _seedFileForFixture({
      context: { database, sessionId },
      argument: overrides,
    });
  };
  const enqueue = (fileIds: string[]) => {
    return _enqueueForFixture({ context: { database }, argument: fileIds });
  };
  const readQueuedKeys = () => {
    return _readQueuedKeysForFixture({ context: { database } });
  };
  return { seedFile, enqueue, readQueuedKeys };
}

async function _createContext() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const sessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const { seedFile, enqueue, readQueuedKeys } =
    _makeOperationsFromFixtureContext({ database, sessionId });
  return { database, memberId, sessionId, seedFile, enqueue, readQueuedKeys };
}

describe("enqueueOrphanedUploadObjects", () => {
  it("queues a single-PUT original and every derivative a browser sends", async () => {
    const { database, sessionId, seedFile, enqueue, readQueuedKeys } =
      await _createContext();
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
      await _createContext();
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
      await _createContext();
    const fileId = await seedFile({ storage_key: null });

    await enqueue([fileId]);

    expect(await readQueuedKeys()).toEqual([]);
    await database.destroy();
  });

  it("queues a multipart original's key too, in case Backblaze assembled it before complete ran", async () => {
    const { database, sessionId, seedFile, enqueue, readQueuedKeys } =
      await _createContext();
    const fileId = await seedFile({
      kind: "video",
      declared_content_type: "video/quicktime",
      multipart_upload_id: "multipart-upload-1",
    });

    await enqueue([fileId]);

    // The abort cannot remove an object that was already assembled, and
    // deleting a key that never existed is harmless.
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

  it("queues nothing for a row an item already stands on", async () => {
    const { database, memberId, sessionId, seedFile, enqueue, readQueuedKeys } =
      await _createContext();
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
    const { database, sessionId, seedFile, enqueue } = await _createContext();
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

  it("queues every key once when a batch crosses an insert's chunk boundary", async () => {
    const { database, sessionId, readQueuedKeys } = await _createContext();
    // 130 rows of four keys each is 520 keys: past the 500 one insert holds.
    // The rows need not exist: the helper reads only what it is handed.
    const files = Array.from({ length: 130 }, () => {
      return {
        id: createId(),
        upload_session_id: sessionId,
        declared_content_type: "image/jpeg",
        multipart_upload_id: null,
        item_id: null,
      };
    }).map((file) => {
      return {
        ...file,
        storage_key: `uploads/${sessionId}/${file.id}/original.jpg`,
      };
    });
    const expectedKeys = files.flatMap((file) => {
      return ["original", "display", "thumb", "poster"].map((purpose) => {
        return `uploads/${sessionId}/${file.id}/${purpose}.jpg`;
      });
    });

    // Handed twice over, so a key repeated across the list is still one row.
    await enqueueOrphanedUploadObjects({
      transaction: database,
      files: [...files, ...files],
      now: NOW,
    });

    expect(expectedKeys).toHaveLength(520);
    expect(await readQueuedKeys()).toEqual(expectedKeys.toSorted());
    await database.destroy();
  });

  it("does nothing for no rows", async () => {
    const { database, readQueuedKeys } = await _createContext();

    await enqueueOrphanedUploadObjects({
      transaction: database,
      files: [],
      now: NOW,
    });

    expect(await readQueuedKeys()).toEqual([]);
    await database.destroy();
  });
});
