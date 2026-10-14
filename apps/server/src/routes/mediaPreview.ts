import {
  mediaNeighborsRequestSchema,
  mediaPreviewRequestSchema,
} from "@memory-shoebox/shared";
import type { FastifyInstance } from "fastify";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readMediaPreviews } from "../media/readMediaPreviews.ts";
import { readMediaNeighbors } from "../media/readMediaNeighbors.ts";

/** Authenticated media-only reads under the existing route rate limiter. */
export async function mediaPreviewRoutes(app: FastifyInstance): Promise<void> {
  app.post("/media/preview", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const viewer = requireViewer(request);
    const parsed = mediaPreviewRequestSchema.parse(request.body);
    const items = await readMediaPreviews({
      database: app.database,
      b2: app.b2,
      viewer,
      now: app.clock(),
      request: parsed,
    });
    return { items };
  });
  app.post("/media/neighbors", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const viewer = requireViewer(request);
    const parsed = mediaNeighborsRequestSchema.parse(request.body);
    return readMediaNeighbors({
      database: app.database,
      b2: app.b2,
      viewer,
      now: app.clock(),
      request: parsed,
    });
  });
}
