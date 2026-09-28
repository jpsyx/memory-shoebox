import type { FastifyInstance } from "fastify";
import type { Updateable } from "kysely";
import {
  revokeMySessionParamsSchema,
  updateMeRequestSchema,
  type ListMySessionsResponse,
  type MeResponse,
  type UpdateMeRequest,
} from "@memory-shoebox/shared";
import { clearSessionCookie } from "../auth/sessionCookie.ts";
import type { Database } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";

/** The columns a `PATCH` body asks to change, and no others. */
function _makeMemberPatchFromBody(
  body: UpdateMeRequest,
): Updateable<Database["members"]> {
  return {
    // An omitted key is left alone; `null` and `""` both clear the name back
    // to the email local-part fallback (Decision 1).
    ...(body.displayName === undefined
      ? {}
      : { display_name: body.displayName === "" ? null : body.displayName }),
    // All four, or none: "turn them all off" is a client convenience that
    // sends four booleans, not an API feature (Decision 16).
    ...(body.notify === undefined
      ? {}
      : {
          notify_on_upload: body.notify.onUpload ? 1 : 0,
          notify_on_comment: body.notify.onComment ? 1 : 0,
          notify_on_reply: body.notify.onReply ? 1 : 0,
          notify_on_removal: body.notify.onRemoval ? 1 : 0,
        }),
  };
}

/**
 * Registers the account routes: `tech-specs/apis/auth.md`, surface 9.
 *
 * Every route here is self-scoped, which is the only reason an email address
 * appears in a payload at all: it is the caller's own.
 */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (request): Promise<MeResponse> => {
    const viewer = requireViewer(request);
    return {
      // `role` is read on this request, so a demotion takes effect on the
      // next one. The visibility side of a role change is the generation
      // bump's job, not this route's.
      me: await getMeDtoFromMemberId({
        database: request.server.database,
        memberId: viewer.memberId,
      }),
      settings: await readShellSettings(request.server.database),
    };
  });

  app.patch("/me", async (request): Promise<MeResponse> => {
    const viewer = requireViewer(request);
    const body = updateMeRequestSchema.parse(request.body);
    const patch = _makeMemberPatchFromBody(body);

    if (Object.keys(patch).length > 0) {
      await request.server.database
        .updateTable("members")
        .set(patch)
        .where("id", "=", viewer.memberId)
        .execute();
    }

    // The post-mutation read shape. A display name change deliberately does
    // not bump `visibility.generation`: only group membership, a rule's
    // subjects and a member's role do.
    return {
      me: await getMeDtoFromMemberId({
        database: request.server.database,
        memberId: viewer.memberId,
      }),
      settings: await readShellSettings(request.server.database),
    };
  });

  app.get("/me/sessions", async (request): Promise<ListMySessionsResponse> => {
    const viewer = requireViewer(request);
    const now = request.server.clock().toISOString();

    // The expiry filter is load-bearing: no job deletes expired sessions
    // promptly (`session-sweep` is hourly housekeeping), so a dead row would
    // otherwise sit in the list looking live.
    const rows = await request.server.database
      .selectFrom("sessions")
      .select([
        "id",
        "device_label",
        "created_at",
        "last_used_at",
        "expires_at",
      ])
      .where("member_id", "=", viewer.memberId)
      .where("expires_at", ">", now)
      .orderBy("last_used_at", "desc")
      .execute();

    return {
      sessions: rows.map((row) => {
        return {
          sessionId: row.id,
          deviceLabel: row.device_label,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
          expiresAt: row.expires_at,
          // Computed at the boundary, never a column
          // (`data-models.md` § Notes for whoever writes the API contract).
          isCurrent: row.id === viewer.sessionId,
        };
      }),
      // A member holds a handful of live devices, bounded by the 30-day
      // expiry, so there is nothing to page.
      nextCursor: null,
    };
  });

  app.delete("/me/sessions/:sessionId", async (request, reply) => {
    const viewer = requireViewer(request);
    const params = revokeMySessionParamsSchema.parse(request.params);
    const now = request.server.clock().toISOString();

    // Ownership is in the `WHERE` clause rather than in a preceding `SELECT`:
    // one round trip, and structurally incapable of answering "that row
    // exists but is not yours".
    const result = await request.server.database
      .deleteFrom("sessions")
      .where("id", "=", params.sessionId)
      .where("member_id", "=", viewer.memberId)
      .where("expires_at", ">", now)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      // Not a 403. Another member's session id and an id that never existed
      // return the identical status, code and message.
      throw ApiError.notFound("session_not_found");
    }

    // The same request for another device and for this one. The difference
    // is entirely in the client, except for this header.
    if (params.sessionId === viewer.sessionId) {
      clearSessionCookie(reply);
    }
    return reply.code(204).send();
  });
}
