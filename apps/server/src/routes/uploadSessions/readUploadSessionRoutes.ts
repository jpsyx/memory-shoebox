import type { FastifyReply, FastifyRequest } from "fastify";
import {
  uploadSessionDetailQuerySchema,
  uploadSessionParamsSchema,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { readUploadSessionDetail } from "../../upload/readUploadSessionDetail.ts";
import {
  assertMayUpload,
  getOpenUploadSessionIdFromMemberId,
  getReadableUploadSessionOr404,
} from "../../upload/uploadSessionAccess.ts";

/**
 * `GET /upload-sessions/current`: the batch to pick up, or `204`.
 *
 * **The `204` is deliberate**: "no batch in flight" is the ordinary answer on
 * every load of the upload surface and must not read as an error, and 404
 * stays reserved for an addressed row. Never another member's session, not
 * even for an admin: resume is per person and per browser. The body is
 * byte-identical to `GET /upload-sessions/:sessionId` with no query, which
 * is what lets one request say "200 of your 264 are up".
 */
export async function getCurrentUploadSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<UploadSessionDetail | FastifyReply> {
  const viewer = requireViewer(request);
  assertMayUpload(viewer);

  const sessionId = await getOpenUploadSessionIdFromMemberId({
    database: request.server.database,
    memberId: viewer.memberId,
  });
  if (sessionId === undefined) {
    return reply.code(204).send();
  }

  return readUploadSessionDetail({
    database: request.server.database,
    b2: request.server.b2,
    sessionId,
    now: request.server.clock(),
  });
}

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

  const session = await getReadableUploadSessionOr404({
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
      cursor: query.cursor ?? null,
      states: query.states,
    },
  });
}
