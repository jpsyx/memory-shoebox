import { registerReconcileMilestoneRoute } from "./registerReconcileMilestoneRoute.ts";
import type { FastifyInstance } from "fastify";
import { registerReadMilestoneItemRoutes } from "./registerReadMilestoneItemRoutes.ts";
import { registerReadMilestoneRoutes } from "./registerReadMilestoneRoutes.ts";
import { registerMutateMilestoneRoutes } from "./registerMutateMilestoneRoutes.ts";

/** Registers milestone CRUD and attachment deltas under the API context. */
export async function registerMilestoneRoutes(
  app: FastifyInstance,
): Promise<void> {
  await registerReadMilestoneRoutes(app);
  await registerReadMilestoneItemRoutes(app);
  await registerMutateMilestoneRoutes(app);
  await registerReconcileMilestoneRoute(app);
}
