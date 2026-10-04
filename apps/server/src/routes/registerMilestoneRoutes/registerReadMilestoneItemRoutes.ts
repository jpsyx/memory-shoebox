import type { FastifyInstance } from "fastify";
import {
  listMilestoneCandidatesRequestSchema,
  listMilestoneMismatchesRequestSchema,
  milestoneIdParamsSchema,
} from "@memory-shoebox/shared";
import { assertMayMutateMilestones } from "../../milestones/milestoneMutationHelpers/milestoneMutationHelpers.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { readMilestoneCandidates } from "../../milestones/readMilestoneCandidates.ts";
import { readMilestoneMismatches } from "../../milestones/readMilestoneMismatches.ts";

/** Registers uploader/admin attachment candidates and mismatch pages. */
export async function registerReadMilestoneItemRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/milestones/:milestoneId/candidates", async (request) => {
    const viewer = requireViewer(request);
    assertMayMutateMilestones(viewer);
    const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
    return readMilestoneCandidates({
      database: app.database,
      b2: app.b2,
      viewer,
      milestoneId,
      query: listMilestoneCandidatesRequestSchema.parse(request.query),
      now: app.clock(),
      logger: request.log,
    });
  });
  app.get("/milestones/:milestoneId/mismatches", async (request) => {
    const viewer = requireViewer(request);
    assertMayMutateMilestones(viewer);
    const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
    return readMilestoneMismatches({
      database: app.database,
      b2: app.b2,
      viewer,
      milestoneId,
      query: listMilestoneMismatchesRequestSchema.parse(request.query),
      now: app.clock(),
      logger: request.log,
    });
  });
}
