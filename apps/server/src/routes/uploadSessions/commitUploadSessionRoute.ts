import type { FastifyRequest } from "fastify";
import {
  uploadSessionParamsSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { abortMultipartUploads } from "../../upload/abortMultipartUploads.ts";
import { commitUploadSession } from "../../upload/commitUploadSession.ts";
import { readUploadSessionDetail } from "../../upload/readUploadSessionDetail.ts";
import {
  assertMayUpload,
  getOwnUploadSessionOr404,
} from "../../upload/uploadSessionAccess.ts";

/**
 * `POST /upload-sessions/:sessionId/commit`: arm a draft, or close an upload
 * with what landed.
 *
 * The transaction holds the state change and the latch and calls nothing
 * outside SQLite. The aborts for the rows the close cancelled come after it,
 * and the response is the detail every other session route serves, read
 * once the write has committed.
 */
export async function postUploadSessionCommit(
  request: FastifyRequest,
): Promise<UploadSessionDetail> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const { database, b2 } = request.server;
  const now = request.server.clock();

  const leftOpen = await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await getOwnUploadSessionOr404({
        database: transaction,
        viewer,
        sessionId,
      });
      assertMayUpload(viewer);
      return commitUploadSession({
        transaction,
        session,
        now: now.toISOString(),
      });
    },
  });

  await abortMultipartUploads({
    database,
    b2,
    uploads: leftOpen,
    logger: request.log,
  });
  return readUploadSessionDetail({ database, b2, sessionId, now });
}
