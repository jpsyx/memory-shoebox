import type { FastifyReply, FastifyRequest } from "fastify";

import { type UploadSessionDetail } from "@memory-shoebox/shared";

import { requireViewer } from "../../../http/requestContextHelpers.ts";

import { readUploadSessionDetail } from "../../../upload/readUploadSessionDetailHelpers.ts";

import {
  assertMayUpload,
  getOpenUploadSessionIdFromMemberId,
} from "../../../upload/uploadSessionAccessHelpers.ts";

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
