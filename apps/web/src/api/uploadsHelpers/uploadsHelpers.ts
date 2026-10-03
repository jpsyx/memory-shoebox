import {
  completeUploadFileResponseSchema,
  presignUploadFileResponseSchema,
  putUploadManifestResponseSchema,
  retryUploadFileResponseSchema,
  uploadBatchEditDtoSchema,
  uploadSessionDetailSchema,
  visibilitySummarySchema,
  type CommitUploadSessionRequest,
  type CompleteUploadFileRequest,
  type CompleteUploadFileResponse,
  type CreateUploadEditRequest,
  type ManifestEntry,
  type OpenUploadSessionRequest,
  type PresignUploadFileRequest,
  type PresignUploadFileResponse,
  type PutUploadManifestResponse,
  type RetryUploadFileResponse,
  type SetUploadVisibilityRequest,
  type UploadBatchEditDto,
  type UploadFileState,
  type UploadSessionDetail,
  type VisibilitySummary,
} from "@memory-shoebox/shared";
import { z } from "zod";
import {
  apiFetch,
  jsonInit,
  makePathFromSearchParams,
} from "@/api/clientHelpers/clientHelpers";

/**
 * The path every route in this module hangs off, for one session.
 *
 * Encoded, because the id arrives from a response and a path segment is not
 * the place to find out that one ever held a slash.
 */
function _makeSessionPathFromSessionId(sessionId: string): string {
  return `/upload-sessions/${encodeURIComponent(sessionId)}`;
}

/** One file's path under its session, for presign, complete and retry. */
function _makeFilePathFromIds(
  options: Readonly<{ sessionId: string; fileId: string }>,
): string {
  return `${_makeSessionPathFromSessionId(options.sessionId)}/files/${encodeURIComponent(options.fileId)}`;
}

/**
 * Opens a draft batch: `POST /api/upload-sessions`.
 *
 * Answers `409 upload_session_conflict` when this member already has one open,
 * with `details.sessionId` naming it, and the caller then asks
 * `getCurrentUploadSession` for it rather than opening a second.
 */
export function openUploadSession(
  body: Readonly<OpenUploadSessionRequest>,
): Promise<UploadSessionDetail> {
  return apiFetch({
    path: "/upload-sessions",
    schema: uploadSessionDetailSchema,
    init: jsonInit({ method: "POST", body }),
  });
}

/**
 * The batch this member can pick up, or `null` when there is none.
 *
 * The route answers `204` with no body for "nothing in flight", which is the
 * ordinary answer on every load of the upload surface, and `apiFetch` hands a
 * `204` to the schema as `undefined`. **`null` rather than the `undefined` this
 * codebase otherwise prefers**, for the reason `meQueryOptions` gives: TanStack
 * Query rejects a query function that returns `undefined`.
 */
export async function getCurrentUploadSession(): Promise<UploadSessionDetail | null> {
  const detail = await apiFetch({
    path: "/upload-sessions/current",
    schema: uploadSessionDetailSchema.optional(),
  });
  return detail ?? null;
}

/** What `getUploadSession` reads: one session, and which page of its files. */
export type GetUploadSessionOptions = {
  /** The session to read. */
  sessionId: string;
  /** Files per page. The server defaults to 100. */
  limit?: number;
  /** The `nextCursor` of the page before, if any. */
  cursor?: string;
  /** Only files in these states. Omitted means all. */
  states?: UploadFileState[];
};

/**
 * One session's progress, days, edit plan and a page of its files.
 *
 * `states` goes on the wire comma-separated, which is the one form the route
 * reads, so the `partial` state can fetch its two casualties without paging
 * through every row.
 */
export function getUploadSession(
  options: Omit<GetUploadSessionOptions, "states"> & {
    states?: readonly UploadFileState[];
  },
): Promise<UploadSessionDetail> {
  const searchParams = new URLSearchParams();
  if (options.limit !== undefined) {
    searchParams.set("limit", String(options.limit));
  }
  if (options.cursor !== undefined) {
    searchParams.set("cursor", options.cursor);
  }
  if (options.states !== undefined && options.states.length > 0) {
    searchParams.set("states", options.states.join(","));
  }
  return apiFetch({
    path: makePathFromSearchParams({
      basePath: _makeSessionPathFromSessionId(options.sessionId),
      searchParams,
    }),
    schema: uploadSessionDetailSchema,
  });
}

/**
 * Declares, re-declares or amends files: `PATCH .../manifest`.
 *
 * Additive and idempotent, so it is safe to send again after a dropped
 * response. At most `UPLOAD_LIMITS.manifestEntriesPerRequest` entries per
 * call: batching a larger selection is the caller's job, because only the
 * caller knows how to pair each outcome back to its `File`.
 */
export function putUploadManifest(
  options: Readonly<{ sessionId: string; files: readonly ManifestEntry[] }>,
): Promise<PutUploadManifestResponse> {
  return apiFetch({
    path: `${_makeSessionPathFromSessionId(options.sessionId)}/manifest`,
    schema: putUploadManifestResponseSchema,
    init: jsonInit({ method: "PATCH", body: { files: options.files } }),
  });
}

/**
 * Mints the URL, or the part URLs, one rendition is PUT to.
 *
 * Called again for the same file to re-presign: a multipart re-presign names
 * the parts it still wants in `partNumbers` and keeps its upload id.
 */
export function presignUploadFile(
  options: Readonly<{
    sessionId: string;
    fileId: string;
    body: PresignUploadFileRequest;
  }>,
): Promise<PresignUploadFileResponse> {
  return apiFetch({
    path: `${_makeFilePathFromIds(options)}/presign`,
    schema: presignUploadFileResponseSchema,
    init: jsonInit({ method: "POST", body: options.body }),
  });
}

/**
 * Ends one file's transfer, either way, and runs the settle latch.
 *
 * The response carries `progress` and `didSettle`, so the caller never needs
 * a `GET` after a complete to move its bar.
 */
export function completeUploadFile(
  options: Readonly<{
    sessionId: string;
    fileId: string;
    body: CompleteUploadFileRequest;
  }>,
): Promise<CompleteUploadFileResponse> {
  return apiFetch({
    path: `${_makeFilePathFromIds(options)}/complete`,
    schema: completeUploadFileResponseSchema,
    init: jsonInit({ method: "POST", body: options.body }),
  });
}

/**
 * Puts one failed file back to `waiting`.
 *
 * No body and no `Content-Type`: Fastify refuses an empty body declared as
 * JSON, so a bodiless `POST` must not claim to carry one.
 */
export function retryUploadFile(
  options: Readonly<{ sessionId: string; fileId: string }>,
): Promise<RetryUploadFileResponse> {
  return apiFetch({
    path: `${_makeFilePathFromIds(options)}/retry`,
    schema: retryUploadFileResponseSchema,
    init: { method: "POST" },
  });
}

/**
 * Arms a draft, or closes an uploading batch with what arrived:
 * `POST .../commit`.
 *
 * The caller says which it means (design decision 17), so a double click or a
 * retry of a commit whose response was lost repeats what already happened
 * instead of being read as the other action: `"arm"` is "Put N up" on a draft,
 * `"close"` is "Send what did arrive" on an uploading batch. The body is
 * required, so unlike `retryUploadFile` this one claims JSON.
 */
export function commitUploadSession(
  options: Readonly<{
    sessionId: string;
    intent: CommitUploadSessionRequest["intent"];
  }>,
): Promise<UploadSessionDetail> {
  const body: CommitUploadSessionRequest = { intent: options.intent };
  return apiFetch({
    path: `${_makeSessionPathFromSessionId(options.sessionId)}/commit`,
    schema: uploadSessionDetailSchema,
    init: jsonInit({ method: "POST", body }),
  });
}

/** Cancels a draft. Answers `204`; a committed batch is `409`. */
export function cancelUploadSession(sessionId: string): Promise<void> {
  return apiFetch({
    path: _makeSessionPathFromSessionId(sessionId),
    schema: z.void(),
    init: { method: "DELETE" },
  });
}

/** Sets the one visibility rule the whole batch will carry. */
export function setUploadVisibility(
  options: Readonly<{ sessionId: string; body: SetUploadVisibilityRequest }>,
): Promise<VisibilitySummary> {
  return apiFetch({
    path: `${_makeSessionPathFromSessionId(options.sessionId)}/visibility`,
    schema: visibilitySummarySchema,
    init: jsonInit({ method: "PATCH", body: options.body }),
  });
}

/** Records one bulk action as one row of the edit plan. */
export function createUploadEdit(
  options: Readonly<{ sessionId: string; body: CreateUploadEditRequest }>,
): Promise<UploadBatchEditDto> {
  return apiFetch({
    path: `${_makeSessionPathFromSessionId(options.sessionId)}/edits`,
    schema: uploadBatchEditDtoSchema,
    init: jsonInit({ method: "POST", body: options.body }),
  });
}

/**
 * Undoes one bulk action. The row survives with `undoneAt` set, so the
 * answer is the edit itself rather than a `204`.
 */
export function undoUploadEdit(
  options: Readonly<{ sessionId: string; editId: string }>,
): Promise<UploadBatchEditDto> {
  return apiFetch({
    path: `${_makeSessionPathFromSessionId(options.sessionId)}/edits/${encodeURIComponent(options.editId)}`,
    schema: uploadBatchEditDtoSchema,
    init: { method: "DELETE" },
  });
}
