import type { Selectable } from "kysely";
import type { Database } from "../../db/types/db.types.ts";

/** An eligible event plus only currently visible source content. */
export type EligibleDigestEvent = Readonly<{
  event: Selectable<Database["notification_digest_events"]>;
  itemIds: readonly string[];
  authorDisplayName: string;
  body: string;
  destination: string;
}>;
