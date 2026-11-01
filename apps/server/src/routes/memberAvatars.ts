import {
  idSchema,
  memberIdParamsSchema,
  removeAvatarRequestSchema,
  reserveAvatarRequestSchema,
} from "@memory-shoebox/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AVATAR_BYTE_LIMIT } from "../avatars/makeAvatarImageFromBytes.ts";
import { removeMemberAvatar } from "../avatars/memberAvatarWriteHelpers.ts";
import { readMemberAvatars } from "../avatars/readMemberAvatars.ts";
import { reserveMemberAvatar } from "../avatars/reserveMemberAvatar.ts";
import {
  retireMemberAvatarUpload,
  uploadMemberAvatar,
} from "../avatars/uploadMemberAvatar.ts";
import { ApiError } from "../http/ApiError.ts";
import { RATE_LIMIT_RULES } from "../http/rateLimit/rateLimit.constants.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
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
      sessionId: viewer.sessionId,
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

/**
 * Registers private own-avatar reservation/removal and authenticated renewal
 * reads.
 */
export async function memberAvatarRoutes(app: FastifyInstance): Promise<void> {
  _registerReservationRoute(app);
  _registerRemovalRoute(app);
  _registerRenewalRoute(app);
  await app.register(_registerBinaryRoutes);
}

function _getAvatarIdFromRequest(request: FastifyRequest): string {
  return idSchema.parse((request.params as { avatarId: unknown }).avatarId);
}

async function _uploadAvatar(request: FastifyRequest) {
  const viewer = requireViewer(request);
  const { database, b2, clock } = request.server;
  await uploadMemberAvatar({
    database,
    b2,
    clock,
    memberId: viewer.memberId,
    avatarId: _getAvatarIdFromRequest(request),
    bytes: request.body as Buffer,
    contentType: request.headers["content-type"]?.split(";")[0]?.trim() ?? "",
    now: clock().toISOString(),
  });
  return {
    sessionId: viewer.sessionId,
    me: await getMeDtoFromMemberId({
      database,
      b2,
      memberId: viewer.memberId,
      now: clock().toISOString(),
    }),
    settings: await readShellSettings(database),
  };
}

function _checkUploadRate(request: FastifyRequest): void {
  const viewer = requireViewer(request);
  const outcome = request.server.rateLimiter.consume({
    key: `avatarUploadPerMember:${viewer.memberId}`,
    windows: RATE_LIMIT_RULES.avatarUploadPerMember.windows,
    nowMs: request.server.clock().getTime(),
  });
  if (!outcome.isAllowed) {
    throw ApiError.rateLimited(outcome.retryAfterSeconds);
  }
}

async function _retireRejectedRequest(request: FastifyRequest): Promise<void> {
  const params = request.params as { avatarId?: unknown };
  const avatarId = idSchema.safeParse(params.avatarId);
  if (request.viewer === undefined || !avatarId.success) {
    return;
  }
  await retireMemberAvatarUpload({
    database: request.server.database,
    memberId: request.viewer.memberId,
    avatarId: avatarId.data,
    now: request.server.clock().toISOString(),
    reservedOnly: true,
  });
}

type AvatarPermit = {
  owner:
    | { request: FastifyRequest; hasStarted: boolean; release: () => void }
    | undefined;
};

function _registerAdmissionHooks(
  app: FastifyInstance,
  permit: AvatarPermit,
): void {
  const releaseUnstarted = (request: FastifyRequest): void => {
    if (permit.owner?.request === request && !permit.owner.hasStarted) {
      permit.owner.release();
      permit.owner = undefined;
    }
  };
  app.addHook("onRequest", async (request) => {
    _checkUploadRate(request);
    const release = request.server.mediaDecodeCoordinator.tryAcquire();
    if (release === undefined) {
      throw new ApiError({
        statusCode: 503,
        code: "avatar_busy",
        message: "Another photo is processing. Try again shortly.",
      });
    }
    permit.owner = { request, hasStarted: false, release };
  });
  app.addHook("onRequestAbort", async (request) => {
    const isUnstarted =
      permit.owner?.request === request && !permit.owner.hasStarted;
    if (isUnstarted) {
      try {
        await _retireRejectedRequest(request);
      } finally {
        releaseUnstarted(request);
      }
    }
  });
  app.addHook("onResponse", async (request) => {
    releaseUnstarted(request);
  });
  app.addHook("onError", async (request) => {
    if (permit.owner?.request === request && !permit.owner.hasStarted) {
      try {
        await _retireRejectedRequest(request);
      } finally {
        releaseUnstarted(request);
      }
    }
  });
}

// This child contains only the binary endpoint. Its parser cannot affect JSON.
async function _registerBinaryRoutes(app: FastifyInstance): Promise<void> {
  const permit: AvatarPermit = { owner: undefined };
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: AVATAR_BYTE_LIMIT },
    (_request, body, done) => {
      done(null, body);
    },
  );
  _registerAdmissionHooks(app, permit);
  app.put(
    "/me/avatar-uploads/:avatarId",
    { bodyLimit: AVATAR_BYTE_LIMIT },
    async (request) => {
      // An aborted pre-handler request must never start with a released permit.
      if (permit.owner?.request !== request || request.raw.aborted) {
        throw ApiError.gone("avatar_upload_expired");
      }
      permit.owner.hasStarted = true;
      try {
        return await _uploadAvatar(request);
      } finally {
        if (permit.owner?.request === request) {
          permit.owner.release();
          permit.owner = undefined;
        }
      }
    },
  );
}
