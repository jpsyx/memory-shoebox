import type { FastifyInstance } from "fastify";
import {
  createRemovalRequestParamsSchema,
  createRemovalRequestRequestSchema,
  listItemRemovalRequestsParamsSchema,
  listRemovalRequestsRequestSchema,
  declineRemovalRequestParamsSchema,
  declineRemovalRequestRequestSchema,
  withdrawRemovalRequestParamsSchema,
} from "@memory-shoebox/shared";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import {
  readRemovalRequests,
  readItemRemovalRequests,
} from "../../removals/readRemovalRequests.ts";
import {
  insertRemovalRequest,
  settleRemovalRequest,
} from "../../removals/removalMutationHelpers.ts";

/** Registers the five removal endpoints; all mutations share their mail transaction. */
export async function registerRemovalRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/removal-requests", async (request) => {
    return readRemovalRequests({
      database: app.database,
      b2: app.b2,
      viewer: requireViewer(request),
      now: app.clock(),
      query: listRemovalRequestsRequestSchema.parse(request.query),
    });
  });
  app.get("/items/:itemId/removal-requests", async (request) => {
    return readItemRemovalRequests({
      database: app.database,
      b2: app.b2,
      viewer: requireViewer(request),
      now: app.clock(),
      ...listItemRemovalRequestsParamsSchema.parse(request.params),
    });
  });
  await registerRemovalMutationRoutes(app);
}

/** Registers state changes inside immediate transactions. */
export async function registerRemovalMutationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/items/:itemId/removal-requests", async (request, reply) => {
    const viewer = requireViewer(request);
    const params = createRemovalRequestParamsSchema.parse(request.params);
    const body = createRemovalRequestRequestSchema.parse(request.body ?? {});
    const result = await runInImmediateTransaction({
      database: app.database,
      callback: (transaction) => {
        return insertRemovalRequest({
          transaction,
          b2: app.b2,
          viewer,
          now: app.clock().toISOString(),
          ...params,
          body,
        });
      },
    });
    return reply.code(201).send(result);
  });
  await _registerSettlementRoutes(app);
}

async function _registerSettlementRoutes(app: FastifyInstance): Promise<void> {
  app.post("/removal-requests/:requestId/decline", async (request) => {
    const viewer = requireViewer(request);
    const params = declineRemovalRequestParamsSchema.parse(request.params);
    const body = declineRemovalRequestRequestSchema.parse(request.body);
    return runInImmediateTransaction({
      database: app.database,
      callback: (transaction) => {
        return settleRemovalRequest({
          transaction,
          b2: app.b2,
          viewer,
          now: app.clock().toISOString(),
          ...params,
          ...body,
          event: "declined",
        });
      },
    });
  });
  app.post("/removal-requests/:requestId/withdraw", async (request) => {
    const viewer = requireViewer(request);
    const params = withdrawRemovalRequestParamsSchema.parse(request.params);
    return runInImmediateTransaction({
      database: app.database,
      callback: (transaction) => {
        return settleRemovalRequest({
          transaction,
          b2: app.b2,
          viewer,
          now: app.clock().toISOString(),
          ...params,
          event: "withdrawn",
        });
      },
    });
  });
}
