import type { Kysely } from "kysely";
import { uuidv7 } from "uuidv7";
import type { Database } from "../types/db.types.ts";
/** Frozen pre-release name fallback, independent of future product changes. */
function _getDisplayNameFromMember(
  member: Readonly<{ display_name: string | null; email: string }>,
): string {
  const storedName = member.display_name?.trim() ?? "";
  const localPart = member.email.split("@")[0];
  return storedName || localPart || member.email;
}

/** Backfills active members and linked names without merging identities. */
export async function up(database: Kysely<Database>): Promise<void> {
  const members = await database
    .selectFrom("members")
    .select(["id", "email", "display_name", "status", "created_at"])
    .execute();
  await members.reduce(async (previousMember, member) => {
    await previousMember;
    const displayName = _getDisplayNameFromMember(member);
    const updated = await database
      .updateTable("people")
      .set({ display_name: displayName })
      .where("member_id", "=", member.id)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0 && member.status === "active") {
      await database
        .insertInto("people")
        .values({
          id: uuidv7(),
          display_name: displayName,
          member_id: member.id,
          preferred_face_item_id: null,
          created_by: member.id,
          created_at: member.created_at,
        })
        .execute();
    }
  }, Promise.resolve());
}
