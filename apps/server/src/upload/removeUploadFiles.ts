import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { getManifestTotalsFromSession } from "./reconcileManifest/manifestCatalogHelpers.ts";
import { assertUploadPlanIsOpen } from "./uploadEditPlanHelpers.ts";
import type { UploadSessionRow } from "./uploadSessionAccessHelpers.ts";

/** Inputs for an atomic draft-file removal. */
type RemoveUploadFilesOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  fileIds: string[];
  now: string;
};

/** Every selected row belongs to this draft and has never moved bytes. */
async function _assertFilesAreRemovable(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
    fileIds: readonly string[];
  }>,
): Promise<void> {
  const rows = await options.transaction
    .selectFrom("upload_files")
    .select(["id", "state"])
    .where("upload_session_id", "=", options.sessionId)
    .where("id", "in", [...options.fileIds])
    .execute();
  if (rows.length !== options.fileIds.length) {
    throw ApiError.notFound("upload_file_not_found");
  }
  if (
    rows.some((row) => {
      return row.state !== "waiting" && row.state !== "refused";
    })
  ) {
    throw ApiError.conflict({ code: "upload_file_conflict" });
  }
}

/** Delete edit groups that lost their last target to the file cascade. */
async function _deleteEmptyUploadEdits(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<void> {
  await options.transaction
    .deleteFrom("upload_batch_edits")
    .where("upload_session_id", "=", options.sessionId)
    .where((expression) => {
      return expression.not(
        expression.exists(
          expression
            .selectFrom("upload_batch_edit_targets")
            .select("id")
            .whereRef("upload_batch_edit_id", "=", "upload_batch_edits.id"),
        ),
      );
    })
    .execute();
}

/**
 * Removes selected rows and their edit targets from an owned draft.
 *
 * The caller reads ownership inside its BEGIN IMMEDIATE transaction. Validate
 * all ids before any write; then the existing file FK cascades targets, and
 * empty edits disappear. Surviving ids, positions, captures and edits stay.
 * No bucket cleanup is necessary before commit: no presign can have occurred.
 */
export async function removeUploadFiles(
  options: Readonly<Omit<RemoveUploadFilesOptions, "fileIds">> &
    Readonly<{ fileIds: readonly string[] }>,
): Promise<void> {
  const { transaction, session, now } = options;
  assertUploadPlanIsOpen(session);
  const fileIds = [...new Set(options.fileIds)];
  await _assertFilesAreRemovable({
    transaction,
    sessionId: session.id,
    fileIds,
  });
  await transaction
    .deleteFrom("upload_files")
    .where("upload_session_id", "=", session.id)
    .where("id", "in", fileIds)
    .execute();
  await _deleteEmptyUploadEdits({ transaction, sessionId: session.id });
  const totals = await getManifestTotalsFromSession({
    transaction,
    sessionId: session.id,
  });
  await transaction
    .updateTable("upload_sessions")
    .set({
      file_count: totals.fileCount,
      total_bytes: totals.totalBytes,
      last_activity_at: now,
    })
    .where("id", "=", session.id)
    .execute();
}
