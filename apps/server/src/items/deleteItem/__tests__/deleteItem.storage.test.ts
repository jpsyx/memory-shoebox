import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import { runInImmediateTransaction } from "../../../db/runInImmediateTransaction.ts";
import { deleteItem } from "../deleteItem.ts";
import { getVisibleItemOr404 } from "../../getVisibleItemOr404.ts";
import { makeViewer } from "../../../../test/helpers/makeViewer.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRendition,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";
import { runDelete } from "../../../../test/helpers/runDelete.ts";

describe("what deleteItem queues for the bucket", () => {
  it("enqueues one object delete per rendition, in the same transaction", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await Promise.all(
      (["original", "display", "thumb"] as const).map((purpose) => {
        return insertRendition(database, { itemId, purpose });
      }),
    );

    await runDelete({ database, memberId, itemId });

    const queued = await database
      .selectFrom("pending_object_deletions")
      .select("storage_key")
      .execute();
    expect(
      queued
        .map((row) => {
          return row.storage_key;
        })
        .sort(),
    ).toEqual([
      `items/${itemId}/display.jpg`,
      `items/${itemId}/original.jpg`,
      `items/${itemId}/thumb.jpg`,
    ]);
    expect(await database.selectFrom("items").selectAll().execute()).toEqual(
      [],
    );
    await database.destroy();
  });

  it("enqueues nothing when the transaction rolls back", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertRendition(database, { itemId });
    const viewer = makeViewer({ memberId });
    const item = await getVisibleItemOr404({ database, viewer, itemId });

    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await deleteItem({ transaction, viewer, item, now: NOW });
          throw new Error("something later in the transaction failed");
        },
      }),
    ).rejects.toThrow();

    // The rows must commit first so the item genuinely vanishes, and the
    // two halves must never disagree: no item deleted, no object enqueued.
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("items").selectAll().execute(),
    ).toHaveLength(1);
    await database.destroy();
  });
});
