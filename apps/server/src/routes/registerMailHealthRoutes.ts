import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readMailHealth } from "../mail/readMailHealth.ts";

/** Registers actionable mail health for active administrators. */
export async function registerMailHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/mail/health", async (request) => {
    if (!requireViewer(request).isAdmin) {
      throw ApiError.forbidden("mail_forbidden");
    }
    const query = z
      .strictObject({ refresh: z.enum(["true", "false"]).optional() })
      .parse(request.query);
    return readMailHealth({
      refresh: query.refresh === "true",
      database: request.server.database,
      domainReader: request.server.mailDomainReader,
      now: request.server.clock().toISOString(),
    });
  });
}
