import { describe, expect, it } from "vitest";
import { RENDITION_PURPOSES } from "@memory-shoebox/shared";
import { createDatabase } from "../../src/db/client.ts";
import { createId } from "../../src/db/createId.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { isStorageKeyInUse } from "../../src/upload/isStorageKeyInUse.ts";
import {
  getUploadFileRefFromStorageKey,
  makeUploadStorageKeyFromRendition,
} from "../../src/upload/presignUploadFile.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
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
  const seedFile = async (overrides: Partial<Database["upload_files"]>) => {
    const fileId = createId();
    await insertUploadFile(database, {
      uploadSessionId: sessionId,
      id: fileId,
      storage_key: `uploads/${sessionId}/${fileId}/original.jpg`,
      ...overrides,
    });
    return {
      fileId,
      keyOf: (name: string) => {
        return `uploads/${sessionId}/${fileId}/${name}.jpg`;
      },
    };
  };
  const isInUse = (storageKey: string) => {
    return isStorageKeyInUse({ database, storageKey });
  };
  return { database, memberId, sessionId, seedFile, isInUse };
};

describe("isStorageKeyInUse", () => {
  it("is true for a key an item's rendition holds", async () => {
    const { database, memberId, isInUse } = await createContext();
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId, storage_key: "media/held.jpg" });

    expect(await isInUse("media/held.jpg")).toBe(true);
    expect(await isInUse("media/other.jpg")).toBe(false);
    await database.destroy();
  });

  it.each(["waiting", "sending"] as const)(
    "is true for any key of a file that is %s, whatever the key's purpose",
    async (state) => {
      const { database, seedFile, isInUse } = await createContext();
      const file = await seedFile({ state });

      expect(await isInUse(file.keyOf("original"))).toBe(true);
      expect(await isInUse(file.keyOf("display"))).toBe(true);
      expect(await isInUse(file.keyOf("thumb"))).toBe(true);
      expect(await isInUse(file.keyOf("poster"))).toBe(true);
      await database.destroy();
    },
  );

  it("is true for the key a file row names, even one the shape does not parse", async () => {
    const { database, seedFile, isInUse } = await createContext();
    await seedFile({ state: "sending", storage_key: "odd/place.mov" });

    expect(await isInUse("odd/place.mov")).toBe(true);
    await database.destroy();
  });

  it("is true for a done file an item stands on", async () => {
    const { database, memberId, sessionId, seedFile, isInUse } =
      await createContext();
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      upload_session_id: sessionId,
    });
    const file = await seedFile({ state: "done", item_id: itemId });

    expect(await isInUse(file.keyOf("original"))).toBe(true);
    await database.destroy();
  });

  it("is false for a done file whose item was deleted", async () => {
    const { database, seedFile, isInUse } = await createContext();
    // `upload_files.item_id` is set to null when its item goes.
    const file = await seedFile({ state: "done", item_id: null });

    expect(await isInUse(file.keyOf("original"))).toBe(false);
    await database.destroy();
  });

  it.each(["failed", "cancelled", "refused"] as const)(
    "is false for a file that is %s",
    async (state) => {
      const { database, seedFile, isInUse } = await createContext();
      const file = await seedFile({ state });

      expect(await isInUse(file.keyOf("original"))).toBe(false);
      expect(await isInUse(file.keyOf("thumb"))).toBe(false);
      await database.destroy();
    },
  );

  it("is false for a key that names no row, and for a sibling file's key", async () => {
    const { database, sessionId, seedFile, isInUse } = await createContext();
    await seedFile({ state: "sending" });

    expect(
      await isInUse(`uploads/${sessionId}/${createId()}/original.jpg`),
    ).toBe(false);
    expect(await isInUse(`uploads/${createId()}/${createId()}/thumb.jpg`)).toBe(
      false,
    );
    await database.destroy();
  });
});

describe("getUploadFileRefFromStorageKey", () => {
  it.each(RENDITION_PURPOSES)(
    "reads back the ids makeUploadStorageKeyFromRendition wrote for %s",
    (purpose) => {
      const sessionId = createId();
      const fileId = createId();
      const key = makeUploadStorageKeyFromRendition({
        sessionId,
        fileId,
        purpose,
        declaredContentType: "video/quicktime",
      });

      expect(getUploadFileRefFromStorageKey(key)).toEqual({
        sessionId,
        fileId,
      });
    },
  );

  it.each([
    "items/an-item/thumb.jpg",
    "uploads/only-a-session/original.jpg",
    "uploads/a/b/c/original.jpg",
    "media/uploads/a/b/original.jpg",
    "",
  ])("is null for %j", (key) => {
    expect(getUploadFileRefFromStorageKey(key)).toBeNull();
  });
});
