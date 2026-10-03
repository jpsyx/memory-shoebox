import type { UploadBatchEditDto } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import type { ReadEditDtosOptions } from "./readUploadBatchEditsHelpers.types.ts";

import {
  readEditRows,
  readTargetCounts,
  makeEditDtoFromRow,
} from "./readUploadBatchEditsSupportHelpers.ts";

/** The rows, their counts, and the DTOs, for either reader below. */
export async function readEditDtos(
  options: Readonly<ReadEditDtosOptions>,
): Promise<UploadBatchEditDto[]> {
  const rows = await readEditRows(options);
  const targetCounts = await readTargetCounts({
    database: options.database,
    editIds: rows.map((row) => {
      return row.editId;
    }),
  });
  return rows.map((row) => {
    return makeEditDtoFromRow({
      row,
      targetCount: targetCounts.get(row.editId) ?? 0,
      isPlanOpen: options.isPlanOpen,
    });
  });
}

/**
 * `UploadSessionDetail.edits`: the plan, oldest first, without the undone.
 *
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.isPlanOpen `committed_at IS NULL`: the plan still moves.
 */
export async function readUploadBatchEdits(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
    isPlanOpen: boolean;
  }>,
): Promise<UploadBatchEditDto[]> {
  // Two queries (the edits, then the target counts grouped by edit id), never
  // one per edit (`upload.md` § Performance).

  return readEditDtos(options);
}
