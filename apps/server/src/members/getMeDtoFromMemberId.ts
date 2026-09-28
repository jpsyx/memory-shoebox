import type { Kysely } from "kysely";
import type { MeDto } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "./getDisplayNameFromMember.ts";
import { getMemberRoleFromStoredValue } from "./getMemberRoleFromStoredValue.ts";

/**
 * The self-scoped account shape, for the member making the request.
 *
 * `email` appears here and in no other non-admin payload, which is the whole
 * reason `MemberRef` was not widened to carry one: this route is self-scoped
 * and returns exactly one address, the caller's own
 * (`auth.md` § Additions requested to the frozen DTOs).
 *
 * @param options.database A Kysely handle or a transaction.
 * @param options.memberId The caller, from `request.viewer`.
 * @throws If no such member exists, which cannot happen for a viewer the
 *   middleware has just resolved.
 */
export async function getMeDtoFromMemberId(options: {
  database: Kysely<Database>;
  memberId: string;
}): Promise<MeDto> {
  const row = await options.database
    .selectFrom("members")
    .select([
      "id",
      "email",
      "display_name",
      "role",
      "notify_on_upload",
      "notify_on_comment",
      "notify_on_reply",
      "notify_on_removal",
      "joined_at",
      "last_signed_in_at",
    ])
    .where("id", "=", options.memberId)
    .executeTakeFirstOrThrow();

  return {
    member: {
      memberId: row.id,
      displayName: getDisplayNameFromMember({
        storedDisplayName: row.display_name ?? undefined,
        email: row.email,
      }),
    },
    storedDisplayName: row.display_name,
    email: row.email,
    role: getMemberRoleFromStoredValue(row.role),
    notify: {
      onUpload: row.notify_on_upload === 1,
      onComment: row.notify_on_comment === 1,
      onReply: row.notify_on_reply === 1,
      onRemoval: row.notify_on_removal === 1,
    },
    joinedAt: row.joined_at,
    lastSignedInAt: row.last_signed_in_at,
  };
}
