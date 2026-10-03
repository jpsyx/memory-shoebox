import { type UploadBatchEditDto } from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../../db/types/db.types.ts";

import { ApiError } from "../../../http/ApiError.ts";

import { type Viewer } from "../../../http/requestContextHelpers.ts";

import { readUploadBatchEditById } from "../../../upload/readUploadBatchEditsHelpers/readUploadBatchEditById.ts";

import { assertUploadPlanIsOpen } from "../../../upload/uploadEditPlanHelpers.ts";

import {
  assertMayUpload,
  getOwnUploadSessionFromSessionIdOr404,
  type UploadSessionRow,
} from "../../../upload/uploadSessionAccessHelpers.ts";

// Everything here writes a draft's plan, so every handler opens the same way,
// through `_getOpenPlanSessionOr404`: the session for its own uploader or one
// 404 (an admin included, since a draft holds no items and writing one would
// attribute uploads to somebody else), then the role, then
// `assertUploadPlanIsOpen`. Each also bumps `last_activity_at`, which is what
// the draft expiry measures: twenty minutes of tagging is not idleness.

/**
 * Returns the uploader's session with an open edit plan. A missing or foreign
 * session is 404 before checking the uploader's role or plan state.
 */
export async function getOpenPlanSessionOr404(
  options: Readonly<{
    transaction: DatabaseExecutor;
    viewer: Viewer;
    sessionId: string;
  }>,
): Promise<UploadSessionRow> {
  const session = await getOwnUploadSessionFromSessionIdOr404({
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
export async function readEditDtoOr404(
  options: Readonly<{
    transaction: DatabaseExecutor;
    session: Readonly<UploadSessionRow>;
    editId: string;
  }>,
): Promise<UploadBatchEditDto> {
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

/**
 * Updates the session's activity time used by draft expiry.
 */
export async function touchSession(
  options: Readonly<{
    transaction: DatabaseExecutor;
    sessionId: string;
    now: string;
  }>,
): Promise<void> {
  await options.transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: options.now })
    .where("id", "=", options.sessionId)
    .execute();
}
