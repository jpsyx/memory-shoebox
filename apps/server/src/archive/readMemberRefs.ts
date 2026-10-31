import type { MemberRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";

/**
 * Query 8 of a timeline page: the per-request member map.
 *
 * Tens of rows, read once, so an uploader `MemberRef` is a lookup rather than
 * a join per print. Unnamed identities use the neutral label Member. Public
 * references never derive a name from an email address.
 *
 * @param database The Kysely handle.
 */
export async function readMemberRefs(
  database: DatabaseExecutor,
): Promise<Map<string, MemberRef>> {
  const rows = await database
    .selectFrom("members")
    .select([
      "members.id as id",
      "members.display_name as displayName",
      "members.email as email",
    ])
    .execute();

  return new Map(
    rows.map((row) => {
      return [
        row.id,
        {
          memberId: row.id,
          displayName: getDisplayNameFromMember({
            storedDisplayName: row.displayName ?? undefined,
            email: row.email,
          }),
        },
      ];
    }),
  );
}
