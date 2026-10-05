import {
  insertItem,
  insertUploadSession,
} from "../../../../apps/server/test/helpers/seedHelpers/itemSeedHelpers.ts";
import {
  insertItemPerson,
  insertItemTag,
  insertTag,
} from "../../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import type { createDatabase } from "../../../../apps/server/src/db/client.ts";
type Database = ReturnType<typeof createDatabase>;

/** Inserts one owned case and its relationships. */
export async function seedVisibleCase(
  database: Database,
  uploaderId: string,
  personId: string,
  adminPersonId: string,
  options: { capturedOn?: string; label: string },
): Promise<{ itemId: string; tagId: string }> {
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: uploaderId,
    state: "settled",
    settled_at: new Date().toISOString(),
    notified_at: new Date().toISOString(),
  });
  const capturedOn = options.capturedOn ?? "2026-09-17";
  const lastItem = await database
    .selectFrom("items")
    .select("seq")
    .orderBy("seq", "desc")
    .executeTakeFirst();
  const itemId = await insertItem(database, {
    uploadedBy: uploaderId,
    seq: (lastItem?.seq ?? 0) + 1,
    upload_session_id: uploadSessionId,
    captured_on: capturedOn,
    captured_at: `${capturedOn}T06:41:00.000Z`,
    alt_text: options.label,
  });
  const tagId = await insertTag(database, {
    name: `${options.label} ${itemId.slice(-8)}`,
  });
  await insertItemTag(database, { itemId, tagId });
  await insertItemPerson(database, { itemId, personId });
  await insertItemPerson(database, { itemId, personId: adminPersonId });
  return { itemId, tagId };
}
