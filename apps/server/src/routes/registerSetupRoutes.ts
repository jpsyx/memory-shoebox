import type { FastifyInstance } from "fastify";
import { createSetupRequestSchema } from "@memory-shoebox/shared";
import { setSessionCookie } from "../auth/sessionCookie.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { initializeShoebox } from "../setup/initializeShoebox.ts";
import { readSetupStatus } from "../setup/readSetupStatus.ts";
import { readSetupProgress } from "../setup/readSetupProgress.ts";
import { completeSetup } from "../setup/completeSetup.ts";
import { requireSetupServingOrigin } from "../setup/requireSetupServingOrigin.ts";

/** Registers empty-catalog creation and durable admin invitation onboarding. */
export async function registerSetupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/setup", async (request, reply) => {
    void reply.header("cache-control", "no-store");
    return readSetupStatus(request.server.database);
  });
  app.post(
    "/setup",
    {
      config: { rateLimit: ["setupCreatePerIp"] },
      onRequest: async (request) => {
        requireSetupServingOrigin(request);
      },
    },
    async (request, reply) => {
      const outcome = await initializeShoebox({
        database: request.server.database,
        body: createSetupRequestSchema.parse(request.body),
        userAgent: request.headers["user-agent"],
        now: request.server.clock().toISOString(),
      });
      setSessionCookie({ reply, token: outcome.token });
      void reply.code(201);
      return outcome.response;
    },
  );
  app.get("/setup/progress", async (request, reply) => {
    void reply.header("cache-control", "no-store");
    return readSetupProgress({
      database: request.server.database,
      viewer: requireViewer(request),
    });
  });
  app.post("/setup/complete", async (request, reply) => {
    await completeSetup({
      database: request.server.database,
      viewer: requireViewer(request),
      now: request.server.clock().toISOString(),
    });
    return reply.code(204).send();
  });
}
