import { enqueueMediaProcessingWork } from "../../mediaProcessing/queue/mediaProcessingWorkHelpers.ts";
import type {
  IngestRendition,
  IngestUploadFileOptions,
} from "./ingestUploadFile.types.ts";

import { getCaptureDateFromUploadFile } from "./getCaptureDateFromUploadFile.ts";
import { applyUploadEditPlan } from "./applyUploadEditPlan.ts";

import {
  insertItem,
  insertRenditions,
} from "./ingestUploadFileSupportHelpers.ts";

/**
 * Turns one verified file into an item in the caller's transaction, with its
 * verified renditions and frozen batch edits.
 *
 * Calls no Backblaze operation: every object must be verified before the
 * transaction opens. The plan freezes at commit, so all files in the batch
 * ingest under the same plan.
 *
 * @param options.transaction The `complete` route's `BEGIN IMMEDIATE`
 *   transaction.
 * @param options.session The file's session.
 * @param options.file The file row, read inside that transaction.
 * @param options.dimensions What `complete` reported, post-orientation.
 * @param options.renditions What Backblaze confirmed, original included.
 * @param options.now The landing instant.
 * @returns The new item id in the itemId field.
 */
export async function ingestUploadFile(
  options: Readonly<Omit<IngestUploadFileOptions, "renditions">> &
    Readonly<{ renditions: readonly IngestRendition[] }>,
): Promise<{ itemId: string }> {
  // Insert the item with current derived day and frozen evidence, insert
  // verified renditions, set upload_files.item_id, then apply every live batch
  // edit targeting the file.

  const { transaction, file, now } = options;
  const captureDate = await getCaptureDateFromUploadFile({ transaction, file });
  const itemId = await insertItem({
    ...options,
    file: { ...file, capture_date: captureDate },
  });
  await insertRenditions({
    transaction,
    itemId,
    renditions: options.renditions,
  });
  await transaction
    .updateTable("upload_files")
    .set({ item_id: itemId, capture_date: captureDate, updated_at: now })
    .where("id", "=", file.id)
    .execute();
  await applyUploadEditPlan({
    transaction,
    session: options.session,
    fileId: file.id,
    itemId,
    now,
  });
  await enqueueMediaProcessingWork({
    database: transaction,
    itemId,
    now,
    isNewUpload: true,
  });
  return { itemId };
}
