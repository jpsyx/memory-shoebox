import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createUploadEditRequestSchema,
  setUploadVisibilityRequestSchema,
  uploadEditParamsSchema,
  uploadSessionParamsSchema,
  type UploadBatchEditDto,
  type VisibilitySummary,
} from "@memory-shoebox/shared";
import { readVisibilitySummaries } from "../../archive/readVisibilitySummaries.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import {
  requireViewer,
  type Viewer,
} from "../../http/requestContextHelpers.ts";
import { getVisibilityRuleFromSubjects } from "../../items/getVisibilityRuleFromSubjects.ts";
import { readUploadBatchEditById } from "../../upload/readUploadBatchEdits.ts";
import {
  assertUploadPlanIsOpen,
  insertUploadEdit,
  makeUploadEditSubjectFromRequest,
  undoUploadEdit,
} from "../../upload/uploadEditPlan.ts";
import {
  assertMayUpload,
  getOwnUploadSessionOr404,
  type UploadSessionRow,
} from "../../upload/uploadSessionAccess.ts";

// Everything here writes a draft's plan, so every handler opens the same way,
// through `_getOpenPlanSessionOr404`: the session for its own uploader or one
// 404 (an admin included, since a draft holds no items and writing one would
// attribute uploads to somebody else), then the role, then
// `assertUploadPlanIsOpen`. Each also bumps `last_activity_at`, which is what
// the draft expiry measures: twenty minutes of tagging is not idleness.

/**
 * The opening every handler here shares, in the contract's order: the
 * session for its own uploader or one 404, then the role, then the plan
 * still open.
 */
async function _getOpenPlanSessionOr404(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  sessionId: string;
}): Promise<UploadSessionRow> {
  const session = await getOwnUploadSessionOr404({
    database: options.transaction,
    viewer: options.viewer,
    sessionId: options.sessionId,
  });
  assertMayUpload(options.viewer);
  assertUploadPlanIsOpen(session);
  return session;
}

/**
 * The edit as both routes answer with it, read inside the write's own
 * transaction. `isPlanOpen` comes from the session row that transaction read
 * first, so `canUndo` is as of the write itself and a commit landing right
 * after cannot leave it stale: SQLite's `BEGIN IMMEDIATE` holds the write
 * lock until the response is composed.
 */
async function _readEditDtoOr404(options: {
  transaction: DatabaseExecutor;
  session: Readonly<UploadSessionRow>;
  editId: string;
}): Promise<UploadBatchEditDto> {
  const edit = await readUploadBatchEditById({
    database: options.transaction,
    sessionId: options.session.id,
    editId: options.editId,
    isPlanOpen: options.session.committed_at === null,
  });
  if (edit === undefined) {
    throw ApiError.notFound("upload_edit_not_found");
  }
  return edit;
}

/** `last_activity_at`, which the draft expiry measures. */
async function _touchSession(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
  now: string;
}): Promise<void> {
  await options.transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: options.now })
    .where("id", "=", options.sessionId)
    .execute();
}

/**
 * `PATCH /upload-sessions/:sessionId/visibility`: one rule for the batch.
 *
 * Finds or creates the rule and sets one column. Rules are never edited in
 * place, and nothing fans out: the items do not exist yet, and ingest copies
 * the id onto each one when they do.
 */
export async function patchUploadVisibility(
  request: FastifyRequest,
): Promise<VisibilitySummary> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const body = setUploadVisibilityRequestSchema.parse(request.body);
  const { database } = request.server;
  const now = request.server.clock().toISOString();

  const visibilityRuleId = await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await _getOpenPlanSessionOr404({
        transaction,
        viewer,
        sessionId,
      });
      const ruleId = await getVisibilityRuleFromSubjects({
        transaction,
        mode: body.mode,
        subjects: body.subjects,
        now,
      });
      await transaction
        .updateTable("upload_sessions")
        .set({ visibility_rule_id: ruleId, last_activity_at: now })
        .where("id", "=", session.id)
        .execute();
      return ruleId;
    },
  });

  const summaries = await readVisibilitySummaries({
    database,
    ruleIds: [visibilityRuleId],
  });
  const summary = summaries.get(visibilityRuleId);
  if (summary === undefined) {
    throw new Error(`Visibility rule ${visibilityRuleId} has no summary`);
  }
  return summary;
}

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
      const session = await _getOpenPlanSessionOr404({
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
      await _touchSession({ transaction, sessionId, now });
      return _readEditDtoOr404({ transaction, session, editId });
    },
  });

  return reply.code(201).send(edit);
}

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
      const session = await _getOpenPlanSessionOr404({
        transaction,
        viewer,
        sessionId,
      });
      await undoUploadEdit({ transaction, sessionId, editId, now });
      await _touchSession({ transaction, sessionId, now });
      return _readEditDtoOr404({ transaction, session, editId });
    },
  });
}
