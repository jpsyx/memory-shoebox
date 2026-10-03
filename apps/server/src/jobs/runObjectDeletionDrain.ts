import type { Kysely } from "kysely";
import type { B2Client } from "../b2/client/client.ts";
import type { Database } from "../db/types/db.types.ts";
import { isStorageKeyInUse } from "../upload/isStorageKeyInUse.ts";

/** What one run did. */
export type ObjectDeletionDrainSummary = {
  deletedCount: number;
  failedCount: number;
};

/** How many objects one run will try. */
const BATCH_SIZE = 100;

/**
 * Deletes one queued object, and then its row. A failure keeps the row and
 * counts the attempt, so the next run tries again.
 *
 * **Nothing is deleted that something now uses.** The batch was read a moment
 * ago, and what the queue held then is not what is true now: a retry takes a
 * file's keys out of the queue and then writes the same deterministic keys
 * again, and a retry that lands between the read and this delete would have
 * its fresh object destroyed. So the key is checked again here, immediately
 * before the delete, and a key in use has only its queue row dropped.
 */
async function _drainOne(options: {
  database: Kysely<Database>;
  b2: B2Client;
  row: { id: string; storage_key: string };
  now: string;
}): Promise<"deleted" | "dropped" | "failed"> {
  const { database, row } = options;
  try {
    const isInUse = await isStorageKeyInUse({
      database,
      storageKey: row.storage_key,
    });
    if (!isInUse) {
      await options.b2.deleteObject({ key: row.storage_key });
    }
    await database
      .deleteFrom("pending_object_deletions")
      .where("id", "=", row.id)
      .execute();
    return isInUse ? "dropped" : "deleted";
  } catch (error: unknown) {
    await database
      .updateTable("pending_object_deletions")
      .set((eb) => {
        return {
          attempts: eb("attempts", "+", 1),
          last_error: error instanceof Error ? error.message : String(error),
          last_attempted_at: options.now,
        };
      })
      .where("id", "=", row.id)
      .execute();
    return "failed";
  }
}

/**
 * Drains `pending_object_deletions` into Backblaze deletes, retrying failures.
 *
 * **There is no transaction spanning SQLite and Backblaze**
 * (`data-models.md` § `pending_object_deletions`), so a row that must lose its
 * objects commits first and enqueues the keys in that same transaction, and
 * this drain deletes them after. Three things enqueue:
 *
 * - **An item delete**, for every rendition's key. The photograph genuinely
 *   vanishes from the Shoebox, and without this table a Backblaze failure
 *   would leave a family paying to store a photograph they were told was
 *   destroyed, with no record that it is still there.
 * - **The commit's close** ("Send what did arrive"), for what the files it
 *   cancels may have left in the bucket.
 * - **The abandon sweep**, for what the files it fails as `abandoned` may have
 *   left there (step 6a design, decision 18).
 *
 * The last two enqueue keys that may never have landed, which is harmless to
 * delete, and keys a retry may bring back, which is why each one is checked
 * against the catalog right before its delete (see `_drainOne`).
 *
 * A failure keeps its row and increments `attempts`, so the next run tries
 * again. There is deliberately no attempt ceiling: an object that will not
 * delete is a bill somebody is paying and a promise that has not been kept, and
 * a row that gave up would be neither visible nor recoverable.
 *
 * The loop is per object because the S3 delete is per object and each one can
 * fail on its own. One slow key must not strand the rest of the batch.
 *
 * The batch is ordered by `last_attempted_at` rather than by `created_at`, and
 * that is what stops a stuck backlog starving everything behind it. SQLite
 * sorts nulls first ascending, so a key nothing has tried yet goes ahead of
 * every key that has already failed, and among the failures the one waiting
 * longest goes first. Ordering by `created_at` alone would hand the whole batch
 * to the same `BATCH_SIZE` permanently failing keys on every run, and an object
 * enqueued behind them would never be attempted at all.
 */
export async function runObjectDeletionDrain(options: {
  database: Kysely<Database>;
  b2: B2Client;
  now: string;
}): Promise<ObjectDeletionDrainSummary> {
  const pending = await options.database
    .selectFrom("pending_object_deletions")
    .select(["id", "storage_key"])
    .orderBy("last_attempted_at", "asc")
    .orderBy("created_at", "asc")
    .limit(BATCH_SIZE)
    .execute();

  let deletedCount = 0;
  let failedCount = 0;

  for (const row of pending) {
    const outcome = await _drainOne({ ...options, row });
    if (outcome === "deleted") {
      deletedCount += 1;
    } else if (outcome === "failed") {
      failedCount += 1;
    }
  }

  return { deletedCount, failedCount };
}
