import type { createDatabase } from "../../../../apps/server/src/db/client.ts";
import { insertPerson } from "../../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
/** Reuses a linked person while keeping disposable item identities distinct. */
export async function seedPeopleFromMembers(
  options: Readonly<{
    database: ReturnType<typeof createDatabase>;
    memberId: string;
    name: string;
  }>,
): Promise<string> {
  const { database, memberId, name } = options;
  await database
    .updateTable("members")
    .set({ display_name: name })
    .where("id", "=", memberId)
    .execute();
  const existing = await database
    .selectFrom("people")
    .select("id")
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  return (
    existing?.id ??
    (await insertPerson(database, { displayName: name, member_id: memberId }))
  );
}
