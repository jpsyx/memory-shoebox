import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  milestoneIdParamsSchema,
  reconcileMilestoneRequestSchema,
  type ReconcileMilestoneResponse,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { assertMayMutateMilestones } from "../../milestones/milestoneMutationHelpers.ts";
import { reconcileMilestone } from "../../milestones/reconcileMilestone.ts";

async function _postMilestoneReconcile(
  request: FastifyRequest,
): Promise<ReconcileMilestoneResponse> {
  const viewer = requireViewer(request);
  assertMayMutateMilestones(viewer);
  const { milestoneId } = milestoneIdParamsSchema.parse(request.params);
  const body = reconcileMilestoneRequestSchema.parse(request.body);
  const now = request.server.clock().toISOString();
  return runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return reconcileMilestone({
        transaction,
        viewer,
        milestoneId,
        body,
        now,
      });
    },
  });
}

/** Registers the transactional uploader/admin milestone reconciliation endpoint. */
export async function registerReconcileMilestoneRoute(
  app: FastifyInstance,
): Promise<void> {
  app.post("/milestones/:milestoneId/reconcile", _postMilestoneReconcile);
}
