import type { FastifyRequest } from "fastify";

import {
  uploadEditParamsSchema,
  type UploadBatchEditDto,
} from "@memory-shoebox/shared";

import { runInImmediateTransaction } from "../../../db/runInImmediateTransaction.ts";

import { requireViewer } from "../../../http/requestContextHelpers.ts";

import { undoUploadEdit } from "../../../upload/uploadEditPlanHelpers.ts";

import {
  getOpenPlanSessionOr404,
  touchSession,
  readEditDtoOr404,
} from "./uploadPlanRouteHelpers.ts";

/**
 * `DELETE /upload-sessions/:sessionId/edits/:editId`: undo one bulk action.
 *
 * `200` with the edit, `undoneAt` set and `canUndo` false: the row still
 * exists, so the post-mutation read shape is the edit itself.
 */
export async function deleteUploadEdit(
  request: FastifyRequest,
): Promise<UploadBatchEditDto> {
  const viewer = requireViewer(request);
  const { sessionId, editId } = uploadEditParamsSchema.parse(request.params);
  const { database } = request.server;
  const now = request.server.clock().toISOString();

  return runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await getOpenPlanSessionOr404({
        transaction,
        viewer,
        sessionId,
      });
      await undoUploadEdit({ transaction, sessionId, editId, now });
      await touchSession({ transaction, sessionId, now });
      return readEditDtoOr404({ transaction, session, editId });
    },
  });
}
