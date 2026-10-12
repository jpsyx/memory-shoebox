import { sql, type Selectable } from "kysely";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { Database, DatabaseExecutor } from "../../db/types/db.types.ts";
import type { FingerprintReadResult } from "./visualFingerprintBackfill.types.ts";

/** Source identity includes the original even when downloading a thumbnail. */
export type PhotoSource = {
  item: Pick<
    Selectable<Database["items"]>,
    | "id"
    | "kind"
    | "byte_size"
    | "checksum"
    | "width"
    | "height"
    | "created_at"
    | "visual_fingerprint"
  >;
  renditions: Array<Selectable<Database["item_renditions"]>>;
};

type SaveFingerprintOptions = {
  database: DatabaseExecutor;
  source: PhotoSource;
  result: FingerprintReadResult;
  now: Date;
};

/** Snapshot only source identity; capture-date and visibility edits are safe. */
export async function getPhotoSourceFromDatabase(
  options: Readonly<{ database: DatabaseExecutor; itemId: string }>,
): Promise<PhotoSource | undefined> {
  const item = await options.database
    .selectFrom("items")
    .select([
      "id",
      "kind",
      "byte_size",
      "checksum",
      "width",
      "height",
      "created_at",
      "visual_fingerprint",
    ])
    .where("id", "=", options.itemId)
    .executeTakeFirst();
  if (item === undefined) {
    return undefined;
  }
  const renditions = await options.database
    .selectFrom("item_renditions")
    .selectAll()
    .where("item_id", "=", options.itemId)
    .where("purpose", "in", ["original", "display", "thumb"])
    .orderBy("purpose")
    .execute();
  return { item, renditions };
}

async function _saveRetry(
  options: Readonly<SaveFingerprintOptions>,
): Promise<"retry" | "changed"> {
  if (!("problem" in options.result)) {
    return "changed";
  }
  const itemId = options.source.item.id;
  const queued = await options.database
    .selectFrom("photo_fingerprint_backfill")
    .select("attempts")
    .where("item_id", "=", itemId)
    .executeTakeFirst();
  if (!queued) {
    return "changed";
  }
  const backoffMs = Math.min(
    86_400_000,
    60_000 * 2 ** Math.min(queued.attempts, 11),
  );
  await options.database
    .updateTable("photo_fingerprint_backfill")
    .set({
      attempts: sql`attempts + 1`,
      next_attempt_at: new Date(
        options.now.getTime() + backoffMs,
      ).toISOString(),
      last_error: options.result.problem,
    })
    .where("item_id", "=", itemId)
    .execute();
  return "retry";
}

async function _saveResult(
  options: Readonly<SaveFingerprintOptions>,
): Promise<"completed" | "retry" | "changed"> {
  if (!("fingerprint" in options.result)) {
    return _saveRetry(options);
  }
  const itemId = options.source.item.id;
  await options.database
    .updateTable("items")
    .set({ visual_fingerprint: options.result.fingerprint ?? null })
    .where("id", "=", itemId)
    .where("visual_fingerprint", "is", null)
    .execute();
  await options.database
    .deleteFrom("photo_fingerprint_backfill")
    .where("item_id", "=", itemId)
    .execute();
  return "completed";
}

/** Commits one independent result only if its catalog source still exists. */
export async function savePhotoFingerprintResult(
  options: Readonly<SaveFingerprintOptions>,
): Promise<"completed" | "retry" | "changed"> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const current = await getPhotoSourceFromDatabase({
        database: transaction,
        itemId: options.source.item.id,
      });
      if (
        !current ||
        JSON.stringify(current) !== JSON.stringify(options.source)
      ) {
        return "changed";
      }
      return _saveResult({ ...options, database: transaction });
    },
  });
}
