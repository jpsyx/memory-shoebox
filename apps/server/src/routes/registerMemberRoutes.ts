import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type ListMembersResponse,
  changeMemberRoleRequestSchema,
  memberIdParamsSchema,
  revokeMemberSessionParamsSchema,
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
import { changeMemberRole } from "../administration/changeMemberRole.ts";
import { removeMember } from "../administration/removeMember.ts";
import { resendMemberInvitation } from "../administration/resendMemberInvitation.ts";
import { revokeMemberInvitation } from "../administration/revokeMemberInvitation.ts";
import { revokeMemberSession } from "../administration/revokeMemberSession.ts";
import {
  requireMemberAdmin,
  type MemberAuthorityOptions,
} from "../administration/memberAuthorityHelpers.ts";
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
  return viewer.isAdmin
    ? readAdminMembers({
        database: request.server.database,
        currentSessionId: viewer.sessionId,
        statuses: query.status ?? ["active", "invited"],
        now: request.server.clock().toISOString(),
      })
    : _readMemberRefs(request.server.database);
}

function _getMemberAuthorityOptions(
  request: FastifyRequest,
): MemberAuthorityOptions {
  const viewer = requireViewer(request);
  requireMemberAdmin(viewer);
  const { memberId } = memberIdParamsSchema.parse(request.params);
  return {
    database: request.server.database,
    viewer,
    memberId,
    now: request.server.clock().toISOString(),
  };
}

function _registerMemberAuthorityRoutes(app: FastifyInstance): void {
  app.patch("/members/:memberId", async (request) => {
    const options = _getMemberAuthorityOptions(request);
    return changeMemberRole({
      ...options,
      ...changeMemberRoleRequestSchema.parse(request.body),
    });
  });
  app.delete("/members/:memberId", async (request) => {
    return removeMember(_getMemberAuthorityOptions(request));
  });
  app.delete("/members/:memberId/invitation", async (request) => {
    return revokeMemberInvitation(_getMemberAuthorityOptions(request));
  });
  app.post(
    "/members/:memberId/invitation/resend",
    {
      preValidation: async (request) => {
        requireMemberAdmin(requireViewer(request));
      },
      config: {
        rateLimit: ["invitationResendPerInvitation", "authenticatedDefault"],
      },
    },
    async (request) => {
      return resendMemberInvitation(_getMemberAuthorityOptions(request));
    },
  );
}

function _registerMemberSessionRoute(app: FastifyInstance): void {
  app.delete(
    "/members/:memberId/sessions/:sessionId",
    async (request, reply) => {
      const viewer = requireViewer(request);
      requireMemberAdmin(viewer);
      await revokeMemberSession({
        database: request.server.database,
        viewer,
        ...revokeMemberSessionParamsSchema.parse(request.params),
        now: request.server.clock().toISOString(),
      });
      return reply.code(204).send();
    },
  );
}

/**
 * Registers role-selected directory reads and administrative member actions.
 */
export async function registerMemberRoutes(
  app: FastifyInstance,
): Promise<void> {
  _registerMemberAuthorityRoutes(app);
  _registerMemberSessionRoute(app);
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
