import { z } from "zod";
import {
  activityRequestSchema,
  itemViewersRequestSchema,
  presenceRequestSchema,
} from "@memory-shoebox/shared";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readActivity } from "../observation/readActivity.ts";
import { readItemViewers } from "../observation/readItemViewers.ts";
import { readPresence } from "../observation/readPresence.ts";

/** Registers private presence, item viewers and historical audit reads. */
export async function registerObservationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/presence", async (request) => {
    const viewer = requireViewer(request);
    const query = presenceRequestSchema.parse(request.query);
    return readPresence({
      database: request.server.database,
      viewer,
      memberId: query.memberId,
      now: request.server.clock().toISOString(),
    });
  });
  app.get("/items/:itemId/viewers", async (request) => {
    const viewer = requireViewer(request);
    const params = itemViewersRequestSchema.parse(request.params);
    return readItemViewers({
      database: request.server.database,
      viewer,
      itemId: params.itemId,
    });
  });
  app.get("/activity", async (request) => {
    const viewer = requireViewer(request);
    if (!viewer.isAdmin) {
      throw ApiError.forbidden("activity_forbidden");
    }
    return readActivity({
      database: request.server.database,
      query: activityRequestSchema
        .extend({ limit: z.coerce.number().int().min(1).max(200).optional() })
        .parse(request.query),
    });
  });
}
