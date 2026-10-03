import type { FastifyInstance } from "fastify";
import { registerReadMilestoneRoutes } from "./readMilestoneRoutes.ts";
import { registerMutateMilestoneRoutes } from "./mutateMilestoneRoutes.ts";

/** Registers milestone CRUD and attachment deltas under the API context. */
export async function registerMilestoneRoutes(
  app: FastifyInstance,
): Promise<void> {
  await registerReadMilestoneRoutes(app);
  await registerMutateMilestoneRoutes(app);
}
