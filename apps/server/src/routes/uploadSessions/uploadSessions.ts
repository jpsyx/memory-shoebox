import type { FastifyInstance } from "fastify";
import { deleteUploadSession } from "./cancelUploadSessionRoute.ts";
import { postUploadSession } from "./openUploadSessionRoute.ts";
import {
  getCurrentUploadSession,
  getUploadSession,
} from "./readUploadSessionRoutes.ts";
import { patchUploadManifest } from "./uploadManifestRoute.ts";

/**
 * The upload slice's routes: `tech-specs/apis/upload.md`.
 *
 * Wiring and nothing else, mirroring `routes/items/items.ts`: every handler is
 * a named function in this directory, one file per route or per small family,
 * and each file carries the reasoning for the routes in it.
 *
 * `/upload-sessions/current` is registered beside `/:sessionId`, and Fastify's
 * router prefers the static segment, so "current" is never parsed as an id.
 */
export async function uploadSessionsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/upload-sessions", postUploadSession);

  app.get("/upload-sessions/current", getCurrentUploadSession);

  app.get("/upload-sessions/:sessionId", getUploadSession);

  app.delete("/upload-sessions/:sessionId", deleteUploadSession);

  app.patch("/upload-sessions/:sessionId/manifest", patchUploadManifest);
}
