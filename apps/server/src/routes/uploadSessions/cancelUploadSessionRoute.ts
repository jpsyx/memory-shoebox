import type { FastifyReply, FastifyRequest } from "fastify";
import { uploadSessionParamsSchema } from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import {
  assertMayUpload,
  getReadableUploadSessionOr404,
} from "../../upload/uploadSessionAccess.ts";
import { IN_FLIGHT_FILE_STATES } from "../../upload/uploadStateHelpers.ts";

/**
 * The two updates, inside one transaction.
 *
 * `committed_at IS NULL` is in the session update's `WHERE` rather than
 * checked beforehand, so a commit that lands between the route's read and
 * this write is a `409` rather than a cancelled live batch: a committed
 * batch has items already, and the email would never fire.
 */
async function _cancelDraft(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
  now: string;
}): Promise<void> {
  const cancelled = await options.transaction
    .updateTable("upload_sessions")
    .set({ state: "cancelled", last_activity_at: options.now })
    .where("id", "=", options.sessionId)
    .where("committed_at", "is", null)
    .executeTakeFirst();
  if (Number(cancelled.numUpdatedRows) === 0) {
    throw ApiError.conflict("upload_session_conflict", {
      sessionId: options.sessionId,
    });
  }

  await options.transaction
    .updateTable("upload_files")
    .set({ state: "cancelled", updated_at: options.now })
    .where("upload_session_id", "=", options.sessionId)
    .where("state", "in", [...IN_FLIGHT_FILE_STATES])
    .execute();
}

/**
 * `DELETE /upload-sessions/:sessionId`: cancel a draft.
 *
 * The uploader's own, or any for an admin. **`409` once committed**, with
 * `details.sessionId`: the client closes it with `POST /commit` instead, and
 * removes anything unwanted with the item delete.
 *
 * The rows stay, as the record that the attempt happened. Nothing is
 * enqueued for deletion and Backblaze is never called, because a draft
 * cannot have a storage key: presign refuses before commit, so **cancelling
 * a draft costs nothing in the bucket**. A milestone created during the
 * draft survives, by design; no tag or person does, because neither was
 * ever written. Cancelling an already cancelled draft changes nothing and
 * still answers `204`.
 */
export async function deleteUploadSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);

  const session = await getReadableUploadSessionOr404({
    database: request.server.database,
    viewer,
    sessionId,
  });
  assertMayUpload(viewer);

  await runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return _cancelDraft({
        transaction,
        sessionId: session.id,
        now: request.server.clock().toISOString(),
      });
    },
  });

  // 204, no body: there is genuinely nothing to return.
  return reply.code(204).send();
}
