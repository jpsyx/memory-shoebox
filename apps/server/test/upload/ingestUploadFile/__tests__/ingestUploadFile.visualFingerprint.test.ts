import { expect, it } from "vitest";
import { createUploadTestContext } from "./createUploadTestContext.ts";

it("copies photo evidence into the item without queueing a second decode", async () => {
  const { database, seedFile, ingest } = await createUploadTestContext();
  try {
    const file = await seedFile({ position: 1 });
    const fingerprint = `v1:${"a".repeat(16)}:${"b".repeat(60)}:${"c".repeat(384)}`;
    const { itemId } = await ingest({
      file: { ...file, visual_fingerprint: fingerprint },
    });
    const item = await database
      .selectFrom("items")
      .selectAll()
      .where("id", "=", itemId)
      .executeTakeFirstOrThrow();
    expect(item).toMatchObject({
      visual_fingerprint: fingerprint,
      checksum: file.content_hash,
      byte_size: file.declared_bytes,
    });
    expect(
      await database
        .selectFrom("photo_fingerprint_backfill")
        .selectAll()
        .execute(),
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});

it("automatically queues photos from legacy clients and leaves videos alone", async () => {
  const { database, seedFile, ingest } = await createUploadTestContext();
  try {
    const photo = await ingest({ file: await seedFile({ position: 1 }) });
    await ingest({
      file: await seedFile({ position: 2, overrides: { kind: "video" } }),
      dimensions: { width: 100, height: 100, durationMs: 1000 },
    });
    expect(
      await database
        .selectFrom("photo_fingerprint_backfill")
        .select(["item_id", "attempts"])
        .execute(),
    ).toEqual([{ item_id: photo.itemId, attempts: 0 }]);
  } finally {
    await database.destroy();
  }
});
