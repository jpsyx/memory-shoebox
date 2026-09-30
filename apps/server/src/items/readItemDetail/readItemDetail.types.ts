import type { B2Client } from "../../b2/client/client.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import type { VisibleItem } from "../getVisibleItemOr404.ts";

/**
 * What the composer needs, and what every mutation hands it back.
 *
 * Declared beside the composer rather than inside it because all three halves
 * of this module take it: the reads, the burst pair, and the payload.
 */
export type ItemDetailOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  item: VisibleItem;
  /** The request's clock, which `expiresAt` counts from. */
  now: Date;
};
