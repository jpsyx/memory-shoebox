import type { FastifyInstance } from "fastify";
import { deleteUploadSession } from "./deleteUploadSession.ts";
import { deleteUploadFiles } from "./deleteUploadFiles.ts";
import { postUploadFileComplete } from "./postUploadFileComplete.ts";
import { postUploadSessionCommit } from "./postUploadSessionCommit.ts";
import { postUploadSession } from "./postUploadSession.ts";
import { postUploadFilePresign } from "./postUploadFilePresign.ts";
import { getCurrentUploadSession } from "./readUploadSessionRoutes/getCurrentUploadSession.ts";
import { getUploadSession } from "./readUploadSessionRoutes/getUploadSession.ts";
import { postUploadFileRetry } from "./postUploadFileRetry.ts";
import { patchUploadManifest } from "./patchUploadManifest.ts";
import { deleteUploadEdit } from "./uploadPlanRouteHelpers/deleteUploadEdit.ts";
import { patchUploadVisibility } from "./uploadPlanRouteHelpers/patchUploadVisibility.ts";
import { postUploadEdit } from "./uploadPlanRouteHelpers/postUploadEdit.ts";

/**
 * The route config every upload-session route shares.
 *
 * One bucket for the whole slice, in place of `authenticatedDefault`: a batch
 * on a fast link makes about four calls a file, which outruns 600 a minute
 * (the rule's own docstring has the arithmetic). Written once so no route can
 * fall back to the default by being left out.
 */
const UPLOAD_ROUTE_OPTIONS = {
  config: { rateLimit: ["uploadSessionPerSession"] },
} as const;

/** The batch itself: open it, find it, read it, cancel it, commit it. */
function _registerSessionRoutes(app: FastifyInstance): void {
  app.post("/upload-sessions", UPLOAD_ROUTE_OPTIONS, postUploadSession);

  app.get(
    "/upload-sessions/current",
    UPLOAD_ROUTE_OPTIONS,
    getCurrentUploadSession,
  );

  app.get(
    "/upload-sessions/:sessionId",
    UPLOAD_ROUTE_OPTIONS,
    getUploadSession,
  );

  app.delete(
    "/upload-sessions/:sessionId",
    UPLOAD_ROUTE_OPTIONS,
    deleteUploadSession,
  );

  app.post(
    "/upload-sessions/:sessionId/commit",
    UPLOAD_ROUTE_OPTIONS,
    postUploadSessionCommit,
  );
}

/** What the batch holds and how it lands: the manifest and the edit plan. */
function _registerPlanRoutes(app: FastifyInstance): void {
  app.patch(
    "/upload-sessions/:sessionId/manifest",
    UPLOAD_ROUTE_OPTIONS,
    patchUploadManifest,
  );

  app.delete(
    "/upload-sessions/:sessionId/files",
    UPLOAD_ROUTE_OPTIONS,
    deleteUploadFiles,
  );

  app.patch(
    "/upload-sessions/:sessionId/visibility",
    UPLOAD_ROUTE_OPTIONS,
    patchUploadVisibility,
  );

  app.post(
    "/upload-sessions/:sessionId/edits",
    UPLOAD_ROUTE_OPTIONS,
    postUploadEdit,
  );

  app.delete(
    "/upload-sessions/:sessionId/edits/:editId",
    UPLOAD_ROUTE_OPTIONS,
    deleteUploadEdit,
  );
}

/** One file's transfer: presign, complete, retry. */
function _registerFileRoutes(app: FastifyInstance): void {
  app.post(
    "/upload-sessions/:sessionId/files/:fileId/presign",
    UPLOAD_ROUTE_OPTIONS,
    postUploadFilePresign,
  );

  app.post(
    "/upload-sessions/:sessionId/files/:fileId/complete",
    UPLOAD_ROUTE_OPTIONS,
    postUploadFileComplete,
  );

  app.post(
    "/upload-sessions/:sessionId/files/:fileId/retry",
    UPLOAD_ROUTE_OPTIONS,
    postUploadFileRetry,
  );
}

/**
 * The upload slice's routes: `tech-specs/apis/upload.md`.
 *
 *
 * `/upload-sessions/current` is registered beside `/:sessionId`, and Fastify's
 * router prefers the static segment, so "current" is never parsed as an id.
 */
export async function uploadSessionsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Wiring and nothing else, mirroring `routes/items/items.ts`: every handler
  // is
  // a named function in this directory, one file per route or per small family,
  // and each file carries the reasoning for the routes in it.

  _registerSessionRoutes(app);
  _registerPlanRoutes(app);
  _registerFileRoutes(app);
}
