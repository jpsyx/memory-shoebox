import type { Kysely } from "kysely";
import { createId } from "../createId.ts";
import type { Database } from "../types/db.types.ts";
import { getDisplayNameFromMember } from "../../members/getDisplayNameFromMember.ts";

/** Backfills active members and linked names without merging identities. */
export async function up(database: Kysely<Database>): Promise<void> {
  const members = await database
    .selectFrom("members")
    .select(["id", "email", "display_name", "status", "created_at"])
    .execute();
  await members.reduce(async (previousMember, member) => {
    await previousMember;
    const displayName = getDisplayNameFromMember({
      storedDisplayName: member.display_name ?? undefined,
      email: member.email,
    });
    const updated = await database
      .updateTable("people")
      .set({ display_name: displayName })
      .where("member_id", "=", member.id)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0 && member.status === "active") {
      await database
        .insertInto("people")
        .values({
          id: createId(),
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
