// apps/server/scripts/archiveSeed/writeArchivePlan/ensureBurst.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { insertBurst } from "../../../test/helpers/seedHelpers/archiveSeedHelpers.ts";
import type { PlannedItem } from "../archivePlan.ts";

/**
 * Finds the burst row one frame belongs to, creating it on the frame's first
 * appearance. Returns undefined for a plain print, which carries no burst key.
 */
export async function ensureBurst(options: {
  database: Kysely<Database>;
  item: PlannedItem;
  uploadSessionId: string;
  burstIdByKey: Map<string, string>;
}): Promise<string | undefined> {
  const { database, item, uploadSessionId, burstIdByKey } = options;
  if (item.burstKey === undefined) {
    return undefined;
  }
  const existing = burstIdByKey.get(item.burstKey);
  if (existing !== undefined) {
    return existing;
  }
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: item.capturedOn,
  });
  burstIdByKey.set(item.burstKey, burstId);
  return burstId;
}
