import type { UploadBatchEditDto } from "@memory-shoebox/shared";

import type { ReadUploadBatchEditByIdOptions } from "./readUploadBatchEditsHelpers.types.ts";

import { readEditDtos } from "./readUploadBatchEditsHelpers.ts";

/**
 * One edit of this session, undone or not, or nothing.
 *
 * What `POST .../edits` and `DELETE .../edits/:editId` answer with, composed
 * by the same function as the list so the two cannot drift.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session the edit must belong to.
 * @param options.editId The edit.
 * @param options.isPlanOpen `committed_at IS NULL`.
 */
export async function readUploadBatchEditById(
  options: Readonly<ReadUploadBatchEditByIdOptions>,
): Promise<UploadBatchEditDto | undefined> {
  const [edit] = await readEditDtos(options);
  return edit;
}
