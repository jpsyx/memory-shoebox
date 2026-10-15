import type { createTestApp } from "../../apps/server/test/helpers/createTestApp.ts";
import { insertRendition } from "../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import type { B2Client } from "../../apps/server/src/b2/createB2Client/createB2Client.types.ts";

/** Replaces only one isolated catalog fixture and its in-memory owned bytes. */
export async function setOwnedOriginalPhoto(
  options: Readonly<{
    database: Awaited<ReturnType<typeof createTestApp>>["database"];
    writeOwnedObject: B2Client["putObject"];
    itemId: string;
    body: Buffer;
    width: number;
    height: number;
  }>,
): Promise<void> {
  const { database, writeOwnedObject, itemId, body, width, height } = options;
  const key = `media/${itemId}/original`;
  await writeOwnedObject({ key, body, contentType: "image/png" });
  await database
    .deleteFrom("item_renditions")
    .where("item_id", "=", itemId)
    .execute();
  await database
    .updateTable("items")
    .set({ width, height, content_type: "image/png" })
    .where("id", "=", itemId)
    .execute();
  await insertRendition(database, {
    itemId,
    purpose: "original",
    storage_key: key,
    content_type: "image/png",
    byte_size: body.length,
    width,
    height,
  });
}
