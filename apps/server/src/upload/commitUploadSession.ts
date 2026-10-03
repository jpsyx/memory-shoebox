import type {
  CommitUploadSessionRequest,
  UploadErrorCode,
} from "@memory-shoebox/shared";
import { sql } from "kysely";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import {
  getMultipartUploadRefFromFile,
  type MultipartUploadRef,
} from "./abortMultipartUploads.ts";
import { enqueueOrphanedUploadObjects } from "./enqueueOrphanedUploadObjects.ts";
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
      code: "upload_session_empty" satisfies UploadErrorCode,
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
 * `(upload_session_id, state)`, queue what the cancelled rows may have left
 * in the bucket (design decision 18), then run the latch once. The 200 that
 * landed get one email; the 64 that did not would be a second session.
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
    .returning([
      "id",
      "upload_session_id",
      "declared_content_type",
      "storage_key",
      "multipart_upload_id",
      "item_id",
    ])
    .execute();
  await enqueueOrphanedUploadObjects({
    transaction,
    files: cancelled,
    now,
  });
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

/** Whether the batch is already past the draft, and not cancelled. */
function _isArmed(session: UploadSessionRow): boolean {
  return session.state === "uploading" || session.state === "settled";
}

/**
 * `POST /commit`, by what the caller said it means (design decision 17).
 *
 * The state alone cannot say: a double click on "Put N up", or a retry of a
 * commit whose response was lost, finds an `uploading` batch and must not
 * take it for "Send what did arrive". So the caller names its intent, and a
 * repeat of what already happened is a no-op rather than the other action:
 *
 * | intent  | `draft`           | `uploading`         | `settled` | `cancelled` |
 * | ------- | ----------------- | ------------------- | --------- | ----------- |
 * | `arm`   | arm it            | no-op               | no-op     | `409`       |
 * | `close` | `409`             | cancel what is open | no-op     | `409`       |
 *
 * A no-op writes nothing; the route still answers it with the detail.
 * Runs inside the route's transaction and calls no Backblaze operation.
 *
 * @param options.transaction The route's `BEGIN IMMEDIATE` transaction.
 * @param options.session The session, read inside it.
 * @param options.intent What the caller meant.
 * @param options.now The commit instant.
 * @returns The multipart uploads left open by the rows it cancelled, empty
 *   for every other outcome, for the route to abort after the commit.
 */
export async function commitUploadSession(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  intent: CommitUploadSessionRequest["intent"];
  now: string;
}): Promise<MultipartUploadRef[]> {
  const { session, intent } = options;
  const isDraft = session.state === "draft" && session.committed_at === null;
  if (intent === "arm" && isDraft) {
    await _armDraft(options);
    return [];
  }
  if (intent === "arm" && _isArmed(session)) {
    return [];
  }
  if (intent === "close" && session.state === "uploading") {
    return _closeWithWhatArrived(options);
  }
  if (intent === "close" && session.state === "settled") {
    return [];
  }
  throw ApiError.conflict("upload_session_conflict" satisfies UploadErrorCode);
}
