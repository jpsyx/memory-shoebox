import { sql, type Kysely } from "kysely";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Database } from "../db/types/db.types.ts";
import { withUploadObjectCleanupLock } from "../upload/withUploadObjectCleanupLock.ts";
import { isStorageKeyInUse } from "../upload/isStorageKeyInUse.ts";
import { getUploadFileRefFromStorageKey } from "../upload/presignUploadFile/uploadStorageKeyHelpers.ts";
import {
  UPLOAD_OBJECT_RECHECK_INTERVAL_MS,
  UPLOAD_OBJECT_SETTLING_WINDOW_MS,
} from "../upload/uploadObjectCleanup.constants.ts";

/** Inputs for _drainOne. */
type DrainOneOptions = {
  database: Kysely<Database>;
  b2: B2Client;
  row: {
    id: string;
    storage_key: string;
    created_at: string;
    last_attempted_at: string | null;
  };
  now: string;
};

/** What one run did. */
export type ObjectDeletionDrainSummary = {
  deletedCount: number;
  failedCount: number;
};

/** How many objects one run will try. */
const BATCH_SIZE = 100;

/** Eligible rows only, so sleeping tombstones never consume a batch slot. */
function _getPendingDeletionsFromDatabase(
  options: Pick<DrainOneOptions, "database" | "now">,
): Promise<Array<DrainOneOptions["row"]>> {
  const uploadSettlingCutoff = new Date(
    Date.parse(options.now) - UPLOAD_OBJECT_SETTLING_WINDOW_MS,
  ).toISOString();
  const uploadRecheckCutoff = new Date(
    Date.parse(options.now) - UPLOAD_OBJECT_RECHECK_INTERVAL_MS,
  ).toISOString();
  const settlingDays = UPLOAD_OBJECT_SETTLING_WINDOW_MS / (24 * 60 * 60 * 1000);
  return options.database
    .selectFrom("pending_object_deletions")
    .select(["id", "storage_key", "created_at", "last_attempted_at"])
    .where((expression) => {
      return expression.or([
        expression("last_attempted_at", "is", null),
        expression("last_error", "is not", null),
        expression("storage_key", "not like", "uploads/%/%/%"),
        expression.and([
          expression("created_at", "<=", uploadSettlingCutoff),
          sql<boolean>`julianday(last_attempted_at) < julianday(created_at) + ${settlingDays}`,
        ]),
        expression("last_attempted_at", "<=", uploadRecheckCutoff),
      ]);
    })
    .orderBy("last_attempted_at", "asc")
    .orderBy("created_at", "asc")
    .limit(BATCH_SIZE)
    .execute();
}

/** Successful upload cleanup stays as a tombstone for future late PUTs. */
async function _recordDeletedObject(options: DrainOneOptions): Promise<void> {
  const { database, row, now } = options;
  if (getUploadFileRefFromStorageKey(row.storage_key) !== undefined) {
    await database
      .updateTable("pending_object_deletions")
      .set({ last_attempted_at: now, last_error: null })
      .where("id", "=", row.id)
      .execute();
    return;
  }
  await database
    .deleteFrom("pending_object_deletions")
    .where("id", "=", row.id)
    .execute();
}

/** Avoid another S3 hide marker when an upload tombstone is already absent. */
async function _deleteUnusedObject(
  options: DrainOneOptions,
): Promise<"deleted" | "checked"> {
  const { row, b2 } = options;
  const isRepeatUploadCheck =
    row.last_attempted_at !== null &&
    getUploadFileRefFromStorageKey(row.storage_key) !== undefined;
  // The B2 adapter maps HEAD's 404 to undefined; other failures retry.
  if (
    isRepeatUploadCheck &&
    (await b2.headObject({ key: row.storage_key })) === undefined
  ) {
    await _recordDeletedObject(options);
    return "checked";
  }
  await b2.deleteObject({ key: row.storage_key });
  await _recordDeletedObject(options);
  return "deleted";
}

/**
 * Deletes one queued object, then removes or retains its cleanup row. A
 * failure keeps the row and counts the attempt, so the next run tries again.
 *
 * **Nothing is deleted that something now uses.** The batch was read a moment
 * ago, and what the queue held then is not what is true now: a retry takes a
 * file's keys out of the queue and then writes the same deterministic keys
 * again. Retry restoration and cleanup share a gate held until the Backblaze
 * delete finishes. A key in use has only its queue row dropped.
 */
async function _deleteQueuedObject(
  options: DrainOneOptions,
): Promise<"deleted" | "checked" | "dropped" | "failed"> {
  const { database, row } = options;
  try {
    const isInUse = await isStorageKeyInUse({
      database,
      storageKey: row.storage_key,
    });
    if (!isInUse) {
      return await _deleteUnusedObject(options);
    }
    await database
      .deleteFrom("pending_object_deletions")
      .where("id", "=", row.id)
      .execute();
    return "dropped";
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

/** Deletes a queued row only if it still exists after acquiring the gate. */
async function _drainOne(
  options: DrainOneOptions,
): Promise<"deleted" | "checked" | "dropped" | "failed"> {
  return withUploadObjectCleanupLock({
    database: options.database,
    callback: async () => {
      // Retry may have removed this row after the batch read. Use its id,
      // since another cleanup can independently enqueue the same key again.
      const row = await options.database
        .selectFrom("pending_object_deletions")
        .select(["id", "storage_key", "created_at", "last_attempted_at"])
        .where("id", "=", options.row.id)
        .executeTakeFirst();
      return row === undefined
        ? "dropped"
        : _deleteQueuedObject({ ...options, row });
    },
  });
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
 * left there.
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
 * Upload keys retain durable tombstones: delete early, recheck after two
 * presign lifetimes, then daily. Browser timers cannot bound every issued
 * request's finish, so rows survive indefinitely. Rechecks HEAD first and
 * delete only present objects, avoiding repeat S3 hide markers. Successful
 * checks set `last_attempted_at` and are excluded until due; failures and new
 * entries remain eligible without a retained batch starving them.
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
  const pending = await _getPendingDeletionsFromDatabase(options);

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
