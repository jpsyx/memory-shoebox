import type { FastifyRequest } from "fastify";

import {
  uploadSessionDetailQuerySchema,
  uploadSessionParamsSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";

import { requireViewer } from "../../../http/requestContextHelpers.ts";

import { readUploadSessionDetail } from "../../../upload/readUploadSessionDetailHelpers.ts";

import {
  assertMayUpload,
  getReadableUploadSessionFromSessionIdOr404,
} from "../../../upload/uploadSessionAccessHelpers.ts";

/**
 * `GET /upload-sessions/:sessionId`: progress, the days, the edit plan, the
 * done figures and one page of files.
 *
 * The uploader's own, or any session for an admin. **404 before 403**: the
 * session is resolved for this viewer first, so a viewer probing another
 * member's id meets the same 404 as a nonexistent one, and only a viewer who
 * did once upload this batch learns that the role now forbids it.
 */
export async function getUploadSession(
  request: FastifyRequest,
): Promise<UploadSessionDetail> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const query = uploadSessionDetailQuerySchema.parse(request.query);

  const session = await getReadableUploadSessionFromSessionIdOr404({
    database: request.server.database,
    viewer,
    sessionId,
  });
  assertMayUpload(viewer);

  return readUploadSessionDetail({
    database: request.server.database,
    b2: request.server.b2,
    sessionId: session.id,
    now: request.server.clock(),
    page: {
      limit: query.limit,
      cursor: query.cursor ?? undefined,
      states: query.states ?? undefined,
    },
  });
}
