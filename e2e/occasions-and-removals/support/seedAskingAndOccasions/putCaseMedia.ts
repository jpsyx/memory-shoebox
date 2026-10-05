import { readFile } from "node:fs/promises";
import type { createDatabase } from "../../../../apps/server/src/db/client.ts";
import { insertRendition } from "../../../../apps/server/test/helpers/seedHelpers/archiveSeedHelpers.ts";
import { E2E_FAKE_S3_URL } from "../../../support/e2eEnvironment.constants.ts";
/** Stores actual bytes for all three case renditions. */
export async function putCaseMedia({
  database,
  itemId,
}: Readonly<{
  database: ReturnType<typeof createDatabase>;
  itemId: string;
}>): Promise<void> {
  const bytes = await readFile(
    new URL(
      "../../../fixtures/upload/IMG-20260503-WA0001.jpg",
      import.meta.url,
    ),
  );
  // One catalog writer and one fake bucket: each rendition finishes before the
  // next.
  for (const purpose of ["thumb", "display", "original"]) {
    const storageKey = `items/${itemId}/${purpose}.jpg`;
    await insertRendition(database, {
      itemId,
      purpose,
      storage_key: storageKey,
      byte_size: bytes.length,
    });
    const response = await fetch(
      `${E2E_FAKE_S3_URL}/memory-shoebox-media/test/${storageKey}`,
      {
        method: "PUT",
        body: bytes,
        headers: { "content-type": "image/jpeg" },
      },
    );
    if (!response.ok) {
      throw new Error(`Fixture rendition PUT failed: ${response.status}`);
    }
  }
}
