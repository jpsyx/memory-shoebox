import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getDisplayNameFromMember } from "./getDisplayNameFromMember.ts";

/**
 * Keeps an account's linked person current without merging names or tags.
 * The caller holds a transaction. Only active members acquire new people;
 * existing identities survive removal and restoration with their original IDs.
 */
export async function syncMemberPerson(
  options: Readonly<{
    transaction: DatabaseExecutor;
    memberId: string;
    now: string;
  }>,
): Promise<void> {
  const { transaction, memberId, now } = options;
  const member = await transaction
    .selectFrom("members")
    .select(["email", "display_name", "status"])
    .where("id", "=", memberId)
    .executeTakeFirstOrThrow();
  const displayName = getDisplayNameFromMember({
    storedDisplayName: member.display_name ?? undefined,
    email: member.email,
  });
  const updated = await transaction
    .updateTable("people")
    .set({ display_name: displayName })
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  if (Number(updated.numUpdatedRows) > 0 || member.status !== "active") {
    return;
  }
  await transaction
    .insertInto("people")
    .values({
      id: createId(),
      display_name: displayName,
      member_id: memberId,
      preferred_face_item_id: null,
      created_by: memberId,
      created_at: now,
    })
    .execute();
}
