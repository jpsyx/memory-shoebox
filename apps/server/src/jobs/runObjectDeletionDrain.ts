import type { Kysely } from "kysely";
import type { B2Client } from "../b2/client/client.ts";
import type { Database } from "../db/types/db.types.ts";

/** What one run did. */
export type ObjectDeletionDrainSummary = {
  deletedCount: number;
  failedCount: number;
};

/** How many objects one run will try. */
const BATCH_SIZE = 100;

/**
 * Drains `pending_object_deletions` into Backblaze deletes, retrying failures.
 *
 * **There is no transaction spanning SQLite and Backblaze**
 * (`data-models.md` § `pending_object_deletions`). A delete commits the rows
 * first, so the photograph genuinely vanishes from the Shoebox, and enqueues
 * every rendition's key here inside that same transaction. Without this table a
 * Backblaze failure would leave a family paying to store a photograph they were
 * told was destroyed, with no record that it is still there.
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
    try {
      await options.b2.deleteObject({ key: row.storage_key });
      await options.database
        .deleteFrom("pending_object_deletions")
        .where("id", "=", row.id)
        .execute();
      deletedCount += 1;
    } catch (error: unknown) {
      failedCount += 1;
      await options.database
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
    }
  }

  return { deletedCount, failedCount };
}
