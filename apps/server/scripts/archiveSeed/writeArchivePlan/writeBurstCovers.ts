// apps/server/scripts/archiveSeed/writeArchivePlan/writeBurstCovers.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { setBurstCover } from "../../../test/helpers/seedHelpers/archiveSeedHelpers.ts";

/** Names each burst's first frame as its cover, now that frames exist. */
export async function writeBurstCovers(options: {
  database: Kysely<Database>;
  burstIdByKey: Map<string, string>;
  burstFrames: Map<string, string[]>;
}): Promise<void> {
  const { database, burstIdByKey, burstFrames } = options;
  // A loop because each update is awaited before the next begins: one SQLite
  // writer, and a `map` over an async function would start them all at once.
  for (const [burstKey, frameIds] of burstFrames) {
    const burstId = burstIdByKey.get(burstKey);
    const coverItemId = frameIds[0];
    if (burstId !== undefined && coverItemId !== undefined) {
      await setBurstCover(database, { burstId, coverItemId });
    }
  }
}
