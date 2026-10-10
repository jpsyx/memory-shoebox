import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@memory-shoebox/shared";
import { SHOEBOX_VERSION } from "../version.ts";

/**
 * Registers `GET /health`, the unauthenticated liveness probe.
 *
 * Fly.io calls it to decide whether a machine is healthy, and a self-hoster
 * can call it to confirm which version is deployed. It deliberately reveals
 * nothing beyond that.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", (): HealthResponse => {
    return {
      status: "ok",
      version: SHOEBOX_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });
}
