import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getUploadFileRefFromStorageKey } from "./presignUploadFile.ts";

/**
 * Whether anything still uses the object at a storage key, so deleting it
 * would destroy something a person can see or a transfer is about to land.
 *
 * In use means either:
 *
 * - an `item_renditions` row holds the key; or
 * - an `upload_files` row owns it, found by the session and file ids in an
 *   upload key (`uploads/<sessionId>/<fileId>/...`) or by the row's own
 *   `storage_key`, and that row is `waiting` or `sending` (a retry put it back
 *   in flight and its keys are about to be written again).
 *
 * **A `done` row protects only what its item's renditions hold**, which the
 * first check already covers. Its other keys are a derivative that landed
 * and was never reported, which `complete` queues because nothing will ever
 * show it, and, once its item is deleted (which nulls `item_id` and leaves
 * the row `done`), every key it named: counting the row would keep a
 * photograph the family deleted in the bucket for good.
 *
 * @param options.database The catalog, read outside any transaction: the
 *   answer is only as fresh as the moment it is read, so a caller asks
 *   immediately before it acts.
 * @param options.storageKey The object key.
 */
export async function isStorageKeyInUse(options: {
  database: DatabaseExecutor;
  storageKey: string;
}): Promise<boolean> {
  const { database, storageKey } = options;
  const rendition = await database
    .selectFrom("item_renditions")
    .select("id")
    .where("storage_key", "=", storageKey)
    .executeTakeFirst();
  if (rendition !== undefined) {
    return true;
  }

  const ref = getUploadFileRefFromStorageKey(storageKey);
  const file = await database
    .selectFrom("upload_files")
    .select("id")
    .where("state", "in", ["waiting", "sending"])
    .where((expressionBuilder) => {
      return expressionBuilder.or([
        expressionBuilder("storage_key", "=", storageKey),
        ...(ref === null
          ? []
          : [
              expressionBuilder.and([
                expressionBuilder("upload_session_id", "=", ref.sessionId),
                expressionBuilder("id", "=", ref.fileId),
              ]),
            ]),
      ]);
    })
    .executeTakeFirst();
  return file !== undefined;
}
