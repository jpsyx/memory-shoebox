import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createMilestoneRequestSchema,
  milestoneIdParamsSchema,
  updateMilestoneRequestSchema,
  setMilestoneItemsRequestSchema,
  type MilestoneDetail,
  type DeleteMilestoneResponse,
  type SetMilestoneItemsResponse,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import {
  requireViewer,
  type Viewer,
} from "../../http/requestContextHelpers.ts";
import {
  assertMayMutateMilestones,
  insertMilestone,
  updateMilestone,
  deleteMilestone,
  setMilestoneItems,
} from "../../milestones/milestoneMutationHelpers/milestoneMutationHelpers.ts";

function _getMutationContextFromRequest(request: Readonly<FastifyRequest>): {
  viewer: Viewer;
  now: string;
} {
  const viewer = requireViewer(request);
  assertMayMutateMilestones(viewer);
  return { viewer, now: request.server.clock().toISOString() };
}

async function _createMilestone(
  request: Readonly<FastifyRequest>,
): Promise<MilestoneDetail> {
  const context = _getMutationContextFromRequest(request);
  const body = createMilestoneRequestSchema.parse(request.body);
  return runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return insertMilestone({ transaction, ...context, body });
    },
  });
}

async function _patchMilestone(
  request: Readonly<FastifyRequest>,
): Promise<MilestoneDetail> {
  const context = _getMutationContextFromRequest(request);
  const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
  const body = updateMilestoneRequestSchema.parse(request.body);
  return runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return updateMilestone({ transaction, ...context, milestoneId, body });
    },
  });
}

async function _deleteMilestone(
  request: Readonly<FastifyRequest>,
): Promise<DeleteMilestoneResponse> {
  const context = _getMutationContextFromRequest(request);
  const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
  return runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return deleteMilestone({ transaction, ...context, milestoneId });
    },
  });
}

async function _patchMilestoneItems(
  request: Readonly<FastifyRequest>,
): Promise<SetMilestoneItemsResponse> {
  const context = _getMutationContextFromRequest(request);
  const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
  const body = setMilestoneItemsRequestSchema.parse(request.body);
  return runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return setMilestoneItems({ transaction, ...context, milestoneId, body });
    },
  });
}

/**
 * Registers uploader/admin mutations, including response reads in
 * transactions.
 */
export async function registerMutateMilestoneRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/milestones", async (request, reply) => {
    const detail = await _createMilestone(request);
    return reply.code(201).send(detail);
  });
  app.patch("/milestones/:milestoneId", _patchMilestone);
  app.delete("/milestones/:milestoneId", _deleteMilestone);
  app.patch("/milestones/:milestoneId/items", _patchMilestoneItems);
}
