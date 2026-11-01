import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createGroupRequestSchema,
  renameGroupRequestSchema,
  replaceGroupMembersRequestSchema,
  groupIdParamsSchema,
  deleteGroupRequestSchema,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import {
  readGroups,
  requireGroupAdmin,
} from "../administration/groupReadHelpers.ts";
import {
  createGroup,
  renameGroup,
  replaceGroupMembers,
} from "../administration/groupMutationHelpers.ts";
import { readGroupUsage } from "../administration/groupUsageHelpers.ts";
import { deleteGroup } from "../administration/deleteGroup.ts";

function _getAdminOptions(request: FastifyRequest): {
  b2: B2Client;
  database: DatabaseExecutor;
  viewer: Viewer;
  now: string;
} {
  const viewer = requireViewer(request);
  requireGroupAdmin(viewer);
  return {
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    now: request.server.clock().toISOString(),
  };
}

function _registerGroupReadRoutes(app: FastifyInstance): void {
  app.get("/groups", async (request) => {
    return readGroups({
      b2: request.server.b2,
      now: request.server.clock().toISOString(),
      database: request.server.database,
      viewer: requireViewer(request),
    });
  });
  app.get("/groups/:groupId/usage", async (request) => {
    const options = _getAdminOptions(request);
    return readGroupUsage({
      ...options,
      ...groupIdParamsSchema.parse(request.params),
      secret: request.server.config.sessionSecret,
    });
  });
}

/** Registers administrative group writes and role-selected picker reads. */
export async function registerGroupRoutes(app: FastifyInstance): Promise<void> {
  _registerGroupReadRoutes(app);
  app.post("/groups", async (request, reply) => {
    const options = _getAdminOptions(request);
    return reply.code(201).send(
      await createGroup({
        ...options,
        body: createGroupRequestSchema.parse(request.body),
      }),
    );
  });
  app.patch("/groups/:groupId", async (request) => {
    const options = _getAdminOptions(request);
    return renameGroup({
      ...options,
      ...groupIdParamsSchema.parse(request.params),
      body: renameGroupRequestSchema.parse(request.body),
    });
  });
  app.put("/groups/:groupId/members", async (request) => {
    const options = _getAdminOptions(request);
    return replaceGroupMembers({
      ...options,
      ...groupIdParamsSchema.parse(request.params),
      body: replaceGroupMembersRequestSchema.parse(request.body),
    });
  });
  app.delete("/groups/:groupId", async (request, reply) => {
    const options = _getAdminOptions(request);
    await deleteGroup({
      ...options,
      ...groupIdParamsSchema.parse(request.params),
      confirmationToken: deleteGroupRequestSchema.parse(request.query)
        .confirmationToken,
      secret: request.server.config.sessionSecret,
    });
    return reply.code(204).send();
  });
}
