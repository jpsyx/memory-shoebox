import type { Selectable } from "kysely";
import type {
  UploadErrorCode,
  UploadSessionState,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type {
  UploadFilesTable,
  UploadSessionsTable,
} from "../db/types/upload.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/**
 * Who may address an upload session, and the one 404 everybody else gets.
 *
 * `upload.md` § Routes: `uploader-of-session` is the session's own
 * `uploaded_by` and nobody else, and an admin reads and cancels (the two
 * routes marked `-or-admin`) but never writes into another member's draft,
 * because a draft holds no items yet and writing into it would attribute
 * somebody else's uploads to them.
 *
 * **Ownership is in the `WHERE` clause, not in a check after the read.** One
 * round trip, and structurally incapable of answering "that row exists but
 * is not yours": another member's session and an id that never existed are
 * the same `ApiError.notFound`, so the 404 is byte-identical by construction.
 *
 * **404 before 403.** A route resolves the session first and only then calls
 * `assertMayUpload`, so a viewer probing ids learns nothing a nonexistent id
 * would not tell them. `POST /api/upload-sessions` addresses no row and
 * checks the role alone.
 */

/** One `upload_sessions` row, every column. */
export type UploadSessionRow = Selectable<UploadSessionsTable>;

/** One `upload_files` row, every column. */
export type UploadFileRow = Selectable<UploadFilesTable>;

/**
 * The session, if it is the viewer's own; otherwise the 404.
 *
 * For every write route, an admin included: a non-owner on a write route
 * gets the same 404 as a nonexistent id.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.viewer The request's viewer.
 * @param options.sessionId The session addressed.
 */
export async function getOwnUploadSessionFromSessionIdOr404(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    sessionId: string;
  }>,
): Promise<UploadSessionRow> {
  const row = await options.database
    .selectFrom("upload_sessions")
    .selectAll()
    .where("id", "=", options.sessionId)
    .where("uploaded_by", "=", options.viewer.memberId)
    .executeTakeFirst();

  if (row === undefined) {
    throw ApiError.notFound(
      "upload_session_not_found" satisfies UploadErrorCode,
    );
  }
  return row;
}

/**
 * The session, if the viewer uploaded it or is an admin; otherwise the 404.
 *
 * For the two `-or-admin` routes only: `GET /api/upload-sessions/:sessionId`
 * and `DELETE /api/upload-sessions/:sessionId`.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.viewer The request's viewer.
 * @param options.sessionId The session addressed.
 */
export async function getReadableUploadSessionFromSessionIdOr404(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    sessionId: string;
  }>,
): Promise<UploadSessionRow> {
  const query = options.database
    .selectFrom("upload_sessions")
    .selectAll()
    .where("id", "=", options.sessionId);
  const row = await (
    options.viewer.isAdmin
      ? query
      : query.where("uploaded_by", "=", options.viewer.memberId)
  ).executeTakeFirst();

  if (row === undefined) {
    throw ApiError.notFound(
      "upload_session_not_found" satisfies UploadErrorCode,
    );
  }
  return row;
}

/**
 * The file, if it belongs to this session; otherwise the 404.
 *
 * Call it after one of the two session lookups above, which is what makes a
 * file in somebody else's session unreachable: its id and a nonexistent one
 * get the same `upload_file_not_found`.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session the route already resolved.
 * @param options.fileId The file addressed.
 */
export async function getUploadFileFromFileIdOr404(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
    fileId: string;
  }>,
): Promise<UploadFileRow> {
  const row = await options.database
    .selectFrom("upload_files")
    .selectAll()
    .where("id", "=", options.fileId)
    .where("upload_session_id", "=", options.sessionId)
    .executeTakeFirst();

  if (row === undefined) {
    throw ApiError.notFound("upload_file_not_found" satisfies UploadErrorCode);
  }
  return row;
}

/**
 * Refuses a viewer: uploading is an uploader capability
 * (`PRODUCT.md` § Roles), and an admin has it too.
 *
 * Role only, so it is safe before any lookup on the one route that addresses
 * no row, and must come after the lookup on every route that does.
 *
 * @param viewer The request's viewer.
 */
export function assertMayUpload(viewer: Readonly<Viewer>): void {
  if (!(viewer.isAdmin || viewer.role === "uploader")) {
    throw ApiError.forbidden("upload_forbidden" satisfies UploadErrorCode);
  }
}

/**
 * This member's one non-terminal session, newest first, or nothing.
 *
 * What `GET /api/upload-sessions/current` answers with and what
 * `POST /api/upload-sessions` conflicts on, on the `(uploaded_by, state)`
 * index. Never another member's, not even for an admin: resume is per person.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.memberId The viewer's member id.
 */
export async function getOpenUploadSessionIdFromMemberId(
  options: Readonly<{
    database: DatabaseExecutor;
    memberId: string;
  }>,
): Promise<string | undefined> {
  const row = await options.database
    .selectFrom("upload_sessions")
    .select("id")
    .where("uploaded_by", "=", options.memberId)
    .where("state", "in", [
      ...([
        "draft",
        "uploading",
      ] as const satisfies readonly UploadSessionState[]),
    ])
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst();
  return row?.id;
}
