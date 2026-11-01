import type { Kysely } from "kysely";
import { retireMemberAvatarUpload } from "../avatars/uploadMemberAvatar.ts";
import type { Database } from "../db/types/db.types.ts";

/**
 * Retires expired reservations, including a crashed writer's durable
 * ownership.
 */
export async function runAvatarReservationSweep(
  options: Readonly<{
    database: Kysely<Database>;
    now: string;
  }>,
): Promise<void> {
  const rows = await options.database
    .selectFrom("member_avatar_uploads")
    .select(["id", "member_id"])
    .where("state", "in", ["reserved", "uploading"])
    .where("expires_at", "<=", options.now)
    .execute();
  // Each retirement is its own short transaction, with no storage calls.
  await rows.reduce(async (previous, row) => {
    await previous;
    await retireMemberAvatarUpload({
      ...options,
      memberId: row.member_id,
      avatarId: row.id,
    });
  }, Promise.resolve());
}
