import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** Setup is available only while the catalog contains no member history. */
export async function readSetupStatus(
  database: DatabaseExecutor,
): Promise<{ isRequired: boolean }> {
  const member = await database
    .selectFrom("members")
    .select("id")
    .limit(1)
    .executeTakeFirst();
  return { isRequired: member === undefined };
}
