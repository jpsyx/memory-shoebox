import type { FastifyInstance } from "fastify";
import {
  memberIdParamsSchema,
  removeAvatarRequestSchema,
  reserveAvatarRequestSchema,
} from "@memory-shoebox/shared";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { reserveMemberAvatar } from "../avatars/reserveMemberAvatar.ts";
import { removeMemberAvatar } from "../avatars/publishMemberAvatar.ts";
import { readMemberAvatars } from "../avatars/readMemberAvatars.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";

function _registerReservationRoute(app: FastifyInstance): void {
  app.post("/me/avatar-uploads", async (request, reply) => {
    const viewer = requireViewer(request);
    const result = await reserveMemberAvatar({
      database: request.server.database,
      memberId: viewer.memberId,
      body: reserveAvatarRequestSchema.parse(request.body),
      now: request.server.clock().toISOString(),
    });
    return reply.code(201).send(result);
  });
}

function _registerRemovalRoute(app: FastifyInstance): void {
  app.delete("/me/avatar", async (request) => {
    const viewer = requireViewer(request);
    const { expectedAvatarId } = removeAvatarRequestSchema.parse(request.body);
    const now = request.server.clock().toISOString();
    const { database, b2 } = request.server;
    await removeMemberAvatar({
      database,
      memberId: viewer.memberId,
      expectedAvatarId,
      now,
    });
    return {
      me: await getMeDtoFromMemberId({
        database,
        b2,
        memberId: viewer.memberId,
        now,
      }),
      settings: await readShellSettings(database),
    };
  });
}

function _registerRenewalRoute(app: FastifyInstance): void {
  app.get("/members/:memberId/avatar", async (request) => {
    requireViewer(request);
    const { memberId } = memberIdParamsSchema.parse(request.params);
    const avatars = await readMemberAvatars({
      database: request.server.database,
      b2: request.server.b2,
      memberIds: [memberId],
      now: request.server.clock().toISOString(),
    });
    return { avatar: avatars.get(memberId) ?? null };
  });
}

/** Registers private own-avatar reservation/removal and authenticated renewal reads. */
export async function memberAvatarRoutes(app: FastifyInstance): Promise<void> {
  _registerReservationRoute(app);
  _registerRemovalRoute(app);
  _registerRenewalRoute(app);
}
