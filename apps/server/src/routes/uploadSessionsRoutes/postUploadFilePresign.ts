import type { FastifyRequest } from "fastify";
import {
  presignUploadFileRequestSchema,
  uploadFileParamsSchema,
  type PresignUploadFileResponse,
} from "@memory-shoebox/shared";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { presignUploadFile } from "../../upload/presignUploadFile/presignUploadFile.ts";
import {
  assertMayUpload,
  getOwnUploadSessionFromSessionIdOr404,
  getUploadFileFromFileIdOr404,
} from "../../upload/uploadSessionAccessHelpers.ts";

/**
 * `POST /upload-sessions/:sessionId/files/:fileId/presign`: the URL the
 * browser PUTs to Backblaze. The server never proxies a byte.
 *
 * The session and the file are read with the outer handle, before any
 * transaction, because the Backblaze calls that follow must not sit inside
 * one; `presignUploadFile` re-reads the row inside its own short write.
 */
export async function postUploadFilePresign(
  request: FastifyRequest,
): Promise<PresignUploadFileResponse> {
  const viewer = requireViewer(request);
  const { sessionId, fileId } = uploadFileParamsSchema.parse(request.params);
  const body = presignUploadFileRequestSchema.parse(request.body);
  const { database, b2 } = request.server;

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

  return presignUploadFile({
    database,
    b2,
    session,
    file,
    input: {
      contentHash: body.contentHash,
      byteSize: body.byteSize,
      purpose: body.purpose,
      partNumbers: body.partNumbers ?? undefined,
    },
    now: request.server.clock(),
    logger: request.log,
  });
}
