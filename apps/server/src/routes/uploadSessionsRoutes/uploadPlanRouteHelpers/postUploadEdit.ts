import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createUploadEditRequestSchema,
  uploadSessionParamsSchema,
} from "@memory-shoebox/shared";

import { runInImmediateTransaction } from "../../../db/runInImmediateTransaction.ts";

import { requireViewer } from "../../../http/requestContextHelpers.ts";

import {
  insertUploadEdit,
  makeUploadEditSubjectFromRequest,
} from "../../../upload/uploadEditPlanHelpers.ts";

import {
  getOpenPlanSessionOr404,
  touchSession,
  readEditDtoOr404,
} from "./uploadPlanRouteHelpers.ts";

/**
 * `POST /upload-sessions/:sessionId/edits`: one bulk action, as one row.
 *
 * `201` with the edit itself. Two identical actions are allowed and
 * harmless: the fan-out at ingest is idempotent through the join tables'
 * uniques.
 */
export async function postUploadEdit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const body = createUploadEditRequestSchema.parse(request.body);
  const subject = makeUploadEditSubjectFromRequest(body);
  const { database } = request.server;
  const now = request.server.clock().toISOString();

  const edit = await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await getOpenPlanSessionOr404({
        transaction,
        viewer,
        sessionId,
      });
      const editId = await insertUploadEdit({
        transaction,
        sessionId,
        subject,
        targetFileIds: body.targetFileIds,
        createdBy: viewer.memberId,
        now,
      });
      await touchSession({ transaction, sessionId, now });
      return readEditDtoOr404({ transaction, session, editId });
    },
  });

  return reply.code(201).send(edit);
}
