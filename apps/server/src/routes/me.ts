import type { FastifyInstance } from "fastify";
import type { Updateable } from "kysely";
import {
  updateMeRequestSchema,
  type MeResponse,
  type UpdateMeRequest,
} from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { getMeDtoFromMemberId } from "../members/getMeDtoFromMemberId.ts";
import { readShellSettings } from "../settings/readShellSettings.ts";

/**
 * A member's own account: `tech-specs/apis/auth.md`, surface 9.
 *
 * Every route here is self-scoped, which is the only reason an email address
 * appears in a payload at all: it is the caller's own.
 */

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

/** Registers the account routes. */
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
}
