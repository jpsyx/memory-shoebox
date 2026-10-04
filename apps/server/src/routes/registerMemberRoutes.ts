import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type ListMembersResponse,
  inviteMemberRequestSchema,
  listMembersRequestSchema,
  listMemberSuggestionsRequestSchema,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { readAdminMembers } from "../administration/readAdminMembers.ts";
import { inviteMember } from "../administration/inviteMember.ts";
import { readMemberSuggestions } from "../administration/readMemberSuggestions.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

async function _readMemberRefs(
  database: DatabaseExecutor,
): Promise<Extract<ListMembersResponse, { shape: "directory" }>> {
  const members = await database
    .selectFrom("members")
    .select(["id", "display_name", "email"])
    .where("status", "in", ["active", "invited"])
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return {
    shape: "directory",
    nextCursor: null,
    members: members.map((member) => {
      return {
        memberId: member.id,
        displayName: getDisplayNameFromMember({
          storedDisplayName: member.display_name ?? undefined,
          email: member.email,
        }),
      };
    }),
  };
}

async function _readDirectory(
  request: FastifyRequest,
): Promise<ListMembersResponse> {
  const viewer = requireViewer(request);
  const rawQuery = request.query as Record<string, unknown>;
  if (!viewer.isAdmin && Object.hasOwn(rawQuery, "status")) {
    throw ApiError.forbidden("members_forbidden");
  }
  const query = listMembersRequestSchema.parse({
    ...rawQuery,
    ...(rawQuery.status === undefined
      ? {}
      : {
          status: Array.isArray(rawQuery.status)
            ? rawQuery.status
            : [rawQuery.status],
        }),
  });
  if (viewer.isAdmin) {
    return readAdminMembers({
      database: request.server.database,
      currentSessionId: viewer.sessionId,
      statuses: query.status ?? ["active", "invited"],
      now: request.server.clock().toISOString(),
    });
  }
  return _readMemberRefs(request.server.database);
}

/** Registers role-selected directory reads and administrative invitations. */
export async function registerMemberRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/members", _readDirectory);
  app.post("/members", async (request, reply) => {
    const viewer = requireViewer(request);
    if (!viewer.isAdmin) {
      throw ApiError.forbidden("members_forbidden");
    }
    const member = await inviteMember({
      database: request.server.database,
      viewer,
      body: inviteMemberRequestSchema.parse(request.body),
      now: request.server.clock().toISOString(),
    });
    return reply.code(201).send(member);
  });
  app.get("/member-suggestions", async (request) => {
    if (!requireViewer(request).isAdmin) {
      throw ApiError.forbidden("members_forbidden");
    }
    const query = listMemberSuggestionsRequestSchema.parse(request.query);
    return readMemberSuggestions({
      database: request.server.database,
      email: query.email,
    });
  });
}
