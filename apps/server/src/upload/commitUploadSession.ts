import type {
  CommitUploadSessionRequest,
  UploadErrorCode,
} from "@memory-shoebox/shared";
import { sql } from "kysely";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { getMultipartUploadRefFromFile } from "./abortMultipartUploads/getMultipartUploadRefFromFile.ts";
import { type MultipartUploadRef } from "./abortMultipartUploads/abortMultipartUploads.types.ts";
import { enqueueOrphanedUploadObjects } from "./enqueueOrphanedUploadObjectsHelpers.ts";
import { settleUploadSession } from "./settleUploadSession.ts";
import type { UploadSessionRow } from "./uploadSessionAccessHelpers.ts";
import { IN_FLIGHT_FILE_STATES } from "./uploadStateHelpers.ts";

/** Inputs for commitUploadSession. */
type CommitUploadSessionOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  intent: CommitUploadSessionRequest["intent"];
  now: string;
};

/**
 * Arms a draft, freezes its figures and runs the settlement latch once.
 *
 * file_count counts every manifest row; total_bytes excludes refused rows. At
 * least one accepted file is required. The once-at-commit latch also handles a
 * manifest already terminal.
 */
async function _armDraft(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  now: string;
}): Promise<void> {
  // Freeze the counts through subqueries of the same session UPDATE.

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
 * Closes the batch with the files that arrived, cancels its in-flight files,
 * queues their abandoned objects and settles the batch.
 *
 * The arrived files produce one batch email. Files left behind must be sent
 * through a later session.
 *
 * @returns The multipart uploads the cancelled rows still hold, for the
 *   caller to abort once this transaction has committed.
 */
async function _closeWithWhatArrived(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  now: string;
}): Promise<MultipartUploadRef[]> {
  // Cancel in-flight rows in one UPDATE on upload_session_id and state.

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
    return upload === undefined ? [] : [upload];
  });
}

/**
 * `POST /commit`, by what the caller said it means (design decision 17).
 *
 * The state alone cannot say: a double click on "Put N up", or a retry of a
 * commit whose response was lost, finds an `uploading` batch and must not take
 * it for "Send what did arrive". So the caller names its intent, and a repeat
 * of what already happened is a no-op rather than the other action:
 *
 * | intent  | `draft`| `uploading`| `settled` | `cancelled` |
 * | ------ | ------- | --------- | ------- | --------- |
 * | `arm`   | arm it| no-op| no-op| `409`|
 * | `close` | `409`      | cancel what is open| no-op| `409`|
 *
 * A no-op writes nothing; the route still answers it with the detail. Runs
 * inside the route's transaction and calls no Backblaze operation.
 *
 * @param options.transaction The route's `BEGIN IMMEDIATE` transaction.
 * @param options.session The session, read inside it.
 * @param options.intent What the caller meant.
 * @param options.now The commit instant.
 * @returns The multipart uploads left open by the rows it cancelled, empty
 * for every other outcome, for the route to abort after the commit.
 */
export async function commitUploadSession(
  options: Readonly<CommitUploadSessionOptions>,
): Promise<MultipartUploadRef[]> {
  const { session, intent } = options;
  const isDraft = session.state === "draft" && session.committed_at === null;
  if (intent === "arm" && isDraft) {
    await _armDraft(options);
    return [];
  }
  if (
    intent === "arm" &&
    ((sourceSession: UploadSessionRow): boolean => {
      return (
        sourceSession.state === "uploading" || sourceSession.state === "settled"
      );
    })(session)
  ) {
    return [];
  }
  if (intent === "close" && session.state === "uploading") {
    return _closeWithWhatArrived(options);
  }
  if (intent === "close" && session.state === "settled") {
    return [];
  }
  throw ApiError.conflict({
    code: "upload_session_conflict" satisfies UploadErrorCode,
  });
}
