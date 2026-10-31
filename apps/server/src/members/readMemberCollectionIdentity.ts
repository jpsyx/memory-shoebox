import type { MemberRef } from "@memory-shoebox/shared";
import { readMemberAvatars } from "../avatars/readMemberAvatars.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Reads a retained account's public identity without exposing account metadata. */
export async function readMemberCollectionIdentity(
  options: Readonly<{
    database: DatabaseExecutor;
    b2: B2Client;
    memberId: string;
    now: string;
  }>,
): Promise<MemberRef | null> {
  const member = await options.database
    .selectFrom("members")
    .select(["id", "display_name"])
    .where("id", "=", options.memberId)
    .executeTakeFirst();
  if (member === undefined) {
    return null;
  }
  const avatars = await readMemberAvatars({
    ...options,
    memberIds: [member.id],
  });
  return {
    memberId: member.id,
    displayName: member.display_name?.trim() || "Member",
    avatar: avatars.get(member.id) ?? null,
  };
}
