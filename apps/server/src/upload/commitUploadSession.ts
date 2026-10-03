import { sql } from "kysely";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import {
  getMultipartUploadRefFromFile,
  type MultipartUploadRef,
} from "./abortMultipartUploads.ts";
import { settleUploadSession } from "./settleUploadSession.ts";
import type { UploadSessionRow } from "./uploadSessionAccess.ts";
import { IN_FLIGHT_FILE_STATES } from "./uploadStateHelpers.ts";

/**
 * "Put 264 up": arm the draft, freeze its figures, run the latch once.
 *
 * `file_count` counts every manifest row and `total_bytes` sums every row
 * that is not `refused`, both as subqueries of the one `UPDATE`. The latch
 * runs in case the manifest were already terminal, which with the empty
 * check above it cannot be today; it is the contract's "once at commit".
 */
async function _armDraft(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  now: string;
}): Promise<void> {
  const { transaction, session, now } = options;
  const accepted = await transaction
    .selectFrom("upload_files")
    .select(sql<number>`COUNT(*)`.as("acceptedCount"))
    .where("upload_session_id", "=", session.id)
    .where("state", "!=", "refused")
    .executeTakeFirstOrThrow();
  if (accepted.acceptedCount === 0) {
    throw new ApiError({
      statusCode: 400,
      code: "upload_session_empty",
      message: "There is nothing in this batch to put up.",
    });
  }

  await transaction
    .updateTable("upload_sessions")
    .set({
      state: "uploading",
      committed_at: now,
      last_activity_at: now,
      file_count: sql<number>`(SELECT COUNT(*) FROM upload_files WHERE upload_session_id = ${session.id})`,
      total_bytes: sql<number>`(SELECT COALESCE(SUM(declared_bytes), 0) FROM upload_files WHERE upload_session_id = ${session.id} AND state <> 'refused')`,
    })
    .where("id", "=", session.id)
    .execute();
  await settleUploadSession({ transaction, sessionId: session.id, now });
}

/**
 * "Send what did arrive": cancel what is in flight in one `UPDATE` on
 * `(upload_session_id, state)`, then run the latch once. The 200 that landed
 * get one email; the 64 that did not would be a second session.
 *
 * @returns The multipart uploads the cancelled rows still hold, for the
 *   caller to abort once this transaction has committed.
 */
async function _closeWithWhatArrived(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  now: string;
}): Promise<MultipartUploadRef[]> {
  const { transaction, session, now } = options;
  const cancelled = await transaction
    .updateTable("upload_files")
    .set({
      state: "cancelled",
      problem_code: "cancelled_by_uploader",
      problem_detail: "Left behind when the rest were sent.",
      presigned_until: null,
      updated_at: now,
    })
    .where("upload_session_id", "=", session.id)
    .where("state", "in", [...IN_FLIGHT_FILE_STATES])
    .returning(["id", "storage_key", "multipart_upload_id"])
    .execute();
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", session.id)
    .execute();
  await settleUploadSession({ transaction, sessionId: session.id, now });

  return cancelled.flatMap((row) => {
    const upload = getMultipartUploadRefFromFile(row);
    return upload === null ? [] : [upload];
  });
}

/**
 * `POST /commit`'s two meanings, keyed on the session's state.
 *
 * On a `draft`, arm it; on `uploading`, close it with what arrived; on
 * `settled` or `cancelled`, `409 upload_session_conflict`. Runs inside the
 * route's transaction and calls no Backblaze operation.
 *
 * @param options.transaction The route's `BEGIN IMMEDIATE` transaction.
 * @param options.session The session, read inside it.
 * @param options.now The commit instant.
 * @returns The multipart uploads left open by the rows it cancelled, empty
 *   on a draft, for the route to abort after the commit.
 */
export async function commitUploadSession(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  now: string;
}): Promise<MultipartUploadRef[]> {
  const { session } = options;
  if (session.state === "draft" && session.committed_at === null) {
    await _armDraft(options);
    return [];
  }
  if (session.state === "uploading") {
    return _closeWithWhatArrived(options);
  }
  throw ApiError.conflict("upload_session_conflict");
}
