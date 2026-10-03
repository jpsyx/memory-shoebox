import type { FastifyReply, FastifyRequest } from "fastify";
import {
  openUploadSessionRequestSchema,
  type UploadErrorCode,
  type UploadSessionDetail,
} from "@memory-shoebox/shared";
import { createId } from "../../db/createId.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { readUploadSessionDetail } from "../../upload/readUploadSessionDetail.ts";
import {
  assertMayUpload,
  getOpenUploadSessionIdFromMemberId,
} from "../../upload/uploadSessionAccess.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../visibility/everyoneRule.ts";

/**
 * The one-open-session check and the insert, in one `BEGIN IMMEDIATE`.
 *
 * Together, because two taps on "Add photos" must not open two drafts: the
 * write lock is taken before the check reads, so the second request waits,
 * then finds the first one's draft and conflicts.
 */
async function _insertDraftUnlessOneIsOpen(options: {
  transaction: DatabaseExecutor;
  memberId: string;
  clientTimezone: string;
  now: string;
}): Promise<string> {
  const openSessionId = await getOpenUploadSessionIdFromMemberId({
    database: options.transaction,
    memberId: options.memberId,
  });
  if (openSessionId !== undefined) {
    throw ApiError.conflict(
      "upload_session_conflict" satisfies UploadErrorCode,
      { sessionId: openSessionId },
    );
  }

  const sessionId = createId();
  await options.transaction
    .insertInto("upload_sessions")
    .values({
      id: sessionId,
      uploaded_by: options.memberId,
      state: "draft",
      // The seeded constant, so the default costs no lookup
      // (`data-models.md` § What that costs).
      visibility_rule_id: EVERYONE_VISIBILITY_RULE_ID,
      file_count: 0,
      total_bytes: 0,
      client_timezone: options.clientTimezone,
      created_at: options.now,
      committed_at: null,
      last_activity_at: options.now,
      settled_at: null,
      notified_at: null,
      notified_member_count: null,
    })
    .execute();
  return sessionId;
}

/**
 * `POST /upload-sessions`: open a draft.
 *
 * **Role only.** Nothing here addresses an existing row, so there is no 404
 * to come first. One open batch per member: a second is `409` naming the
 * first in `details.sessionId`, and the client calls `GET /current`.
 *
 * **Nothing here can leave a byte in the bucket**: no Backblaze call, no
 * object key reserved, no `items` row.
 */
export async function postUploadSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<UploadSessionDetail> {
  const viewer = requireViewer(request);
  const body = openUploadSessionRequestSchema.parse(request.body);
  assertMayUpload(viewer);
  const now = request.server.clock();

  const sessionId = await runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return _insertDraftUnlessOneIsOpen({
        transaction,
        memberId: viewer.memberId,
        clientTimezone: body.clientTimezone,
        now: now.toISOString(),
      });
    },
  });

  void reply.code(201);
  return readUploadSessionDetail({
    database: request.server.database,
    b2: request.server.b2,
    sessionId,
    now,
  });
}
