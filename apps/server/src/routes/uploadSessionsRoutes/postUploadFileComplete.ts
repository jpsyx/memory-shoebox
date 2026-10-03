import type { FastifyRequest } from "fastify";
import {
  completeUploadFileRequestSchema,
  uploadFileParamsSchema,
  type CompleteUploadFileResponse,
} from "@memory-shoebox/shared";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { completeUploadFile } from "../../upload/completeUploadFile/completeUploadFile.ts";
import { readCompleteUploadFileResponse } from "../../upload/completeUploadFile/readCompleteUploadFileResponse.ts";
import {
  assertMayUpload,
  getOwnUploadSessionFromSessionIdOr404,
  getUploadFileFromFileIdOr404,
} from "../../upload/uploadSessionAccessHelpers.ts";

/**
 * `POST /upload-sessions/:sessionId/files/:fileId/complete`: end one file's
 * transfer, verify it in Backblaze, ingest it, and run the latch.
 *
 * The session and the file are read with the outer handle, because the
 * Backblaze calls that follow must not sit inside a transaction. The
 * response is read once every write has committed.
 */
export async function postUploadFileComplete(
  request: FastifyRequest,
): Promise<CompleteUploadFileResponse> {
  const viewer = requireViewer(request);
  const { sessionId, fileId } = uploadFileParamsSchema.parse(request.params);
  const body = completeUploadFileRequestSchema.parse(request.body);
  const { database, b2 } = request.server;
  const now = request.server.clock();

  const session = await getOwnUploadSessionFromSessionIdOr404({
    database,
    viewer,
    sessionId,
  });
  assertMayUpload(viewer);
  const file = await getUploadFileFromFileIdOr404({
    database,
    sessionId,
    fileId,
  });

  const { didSettle } = await completeUploadFile({
    database,
    b2,
    session,
    file,
    body,
    now: now.toISOString(),
    logger: request.log,
  });
  return readCompleteUploadFileResponse({
    database,
    b2,
    sessionId,
    fileId,
    didSettle,
    now,
  });
}
