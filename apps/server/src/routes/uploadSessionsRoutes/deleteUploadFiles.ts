import type { FastifyReply, FastifyRequest } from "fastify";
import {
  removeUploadFilesRequestSchema,
  uploadSessionParamsSchema,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { removeUploadFiles } from "../../upload/removeUploadFiles.ts";
import {
  assertMayUpload,
  getOwnUploadSessionFromSessionIdOr404,
} from "../../upload/uploadSessionAccessHelpers.ts";

/**
 * DELETE /upload-sessions/:sessionId/files removes selected draft rows.
 *
 * Ownership, role and draft eligibility are checked inside BEGIN IMMEDIATE,
 * so a concurrent arm cannot move bytes between the check and the deletion.
 * A foreign session is the existing private 404, before the role's 403.
 * Draft files have no objects: presign refuses until the batch is committed.
 */
export async function deleteUploadFiles(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const { fileIds } = removeUploadFilesRequestSchema.parse(request.body);
  const { database } = request.server;
  const now = request.server.clock().toISOString();

  await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await getOwnUploadSessionFromSessionIdOr404({
        database: transaction,
        viewer,
        sessionId,
      });
      assertMayUpload(viewer);
      await removeUploadFiles({ transaction, session, fileIds, now });
    },
  });
  return reply.code(204).send();
}
