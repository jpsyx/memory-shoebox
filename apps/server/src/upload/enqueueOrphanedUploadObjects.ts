import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import {
  DERIVATIVE_PURPOSES,
  makeUploadStorageKeyFromRendition,
} from "./presignUploadFile.ts";
import type { UploadFileRow } from "./uploadSessionAccess.ts";

/** The columns of a row that decide which objects it may have left behind. */
export type OrphanableUploadFile = Readonly<
  Pick<
    UploadFileRow,
    | "id"
    | "upload_session_id"
    | "declared_content_type"
    | "storage_key"
    | "multipart_upload_id"
    | "item_id"
  >
>;

/**
 * How many keys one `INSERT` carries. Six values are bound per key, so a very
 * large abandoned batch stays well under SQLite's limit on bound variables.
 */
const KEYS_PER_INSERT = 500;

/**
 * Every object a row may have left in the bucket that nothing references:
 * its original, and each derivative the browser sends ahead of it.
 *
 * Empty for a row that never got a `storage_key` (a presign sets it before
 * any byte can move, and a derivative needs the original presigned first, so
 * nothing of it can be in the bucket), and for a row an item already stands on
 * (its objects are that item's renditions).
 *
 * **A multipart original's key is included too**, though its upload is
 * aborted. Backblaze may have finished assembling the object before `complete`
 * ran, and an abort cannot remove an assembled object. Deleting a key that
 * never existed is harmless.
 */
function _getOrphanedKeysFromFile(file: OrphanableUploadFile): string[] {
  if (file.storage_key === null || file.item_id !== null) {
    return [];
  }
  const derivativeKeys = DERIVATIVE_PURPOSES.map((purpose) => {
    return makeUploadStorageKeyFromRendition({
      sessionId: file.upload_session_id,
      fileId: file.id,
      purpose,
      declaredContentType: file.declared_content_type,
    });
  });
  return [file.storage_key, ...derivativeKeys];
}

/**
 * Enqueues what rows that will never land may have left in the bucket, for
 * `object-deletion-drain` to delete (step 6a design, decision 18).
 *
 * A row cancelled by "Send what did arrive", failed as `abandoned` by the
 * sweep, or failed by `complete`, can already have bytes in the bucket: a single PUT that landed just
 * before the tab closed, or the derivatives sent ahead of the original. No
 * `item_renditions` row names them, so nothing else would ever delete them,
 * and a family would pay to store them forever. Deleting a key that never
 * landed is harmless.
 *
 * **Call it in the same transaction as the state change**, so a crash cannot
 * leave a row terminal with its objects unqueued. It calls no Backblaze
 * operation: the drain does, after the commit.
 *
 * A key already queued is left as it is (`ON CONFLICT (storage_key) DO
 * NOTHING`: one object to delete, not two attempts). A retry takes its keys
 * back out of the queue in its own transaction, and the drain checks each key
 * against the catalog right before it deletes, so a re-uploaded object is
 * never deleted.
 *
 * @param options.transaction The caller's open transaction.
 * @param options.files The rows that just became `cancelled` or `failed`.
 * @param options.now The instant of the state change.
 */
export async function enqueueOrphanedUploadObjects(options: {
  transaction: DatabaseExecutor;
  files: readonly OrphanableUploadFile[];
  now: string;
}): Promise<void> {
  const storageKeys = [
    ...new Set(
      options.files.flatMap((file) => {
        return _getOrphanedKeysFromFile(file);
      }),
    ),
  ];
  for (let start = 0; start < storageKeys.length; start += KEYS_PER_INSERT) {
    await options.transaction
      .insertInto("pending_object_deletions")
      .values(
        storageKeys.slice(start, start + KEYS_PER_INSERT).map((storageKey) => {
          return {
            id: createId(),
            storage_key: storageKey,
            attempts: 0,
            last_error: null,
            created_at: options.now,
            last_attempted_at: null,
          };
        }),
      )
      .onConflict((conflict) => {
        return conflict.column("storage_key").doNothing();
      })
      .execute();
  }
}
