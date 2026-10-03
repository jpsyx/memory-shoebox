import type { MediaSource, PersonRef } from "@memory-shoebox/shared";
import { appConfig } from "../../../../../app.config.ts";
import { readMediaSources } from "../../archive/readMediaSources.ts";
import { readPeopleRefsByItemId } from "../../archive/readPeopleRefsByItemId.ts";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";

/** readBurstFrameSources inputs or output fields. */
type ReadBurstFrameSourcesShape = {
  database: DatabaseExecutor;
  b2: B2Client;
  itemIds: readonly string[];
  now: Date;
};

/**
 * The three batched reads a strip composes from, for the ids it will draw.
 *
 * A type rather than three parameters, so the whole set arrives together: a
 * caller holding two of them and letting the third be read again is exactly
 * the duplication this exists to remove.
 */
export type BurstFrameSources = {
  /** Signed renditions by item id, from one `item_id IN (...)`. */
  mediaSources: ReadonlyMap<string, ReadonlyMap<string, MediaSource>>;
  /** Who is in each frame, from one `item_id IN (...)`, for the alt text. */
  peopleByItemId: ReadonlyMap<string, readonly PersonRef[]>;
  /** The Shoebox's own zone, which the alt text's date is rendered in. */
  timezone: string;
};

/**
 * The three reads a strip needs, when the caller does not already hold them.
 *
 * Three queries for a strip of any size: one batched rendition query, one
 * batched people query for the alt text, and one read of the timezone setting
 * the alt text's date is rendered in. **A caller composing a payload that
 * already covers the item and the strip passes its own maps to
 * `makeBurstFrameRefsFromRows` instead**, because `items.md`
 * § Performance queries 3 and 6 are each one batched read covering the item
 * **and** the strip, not two.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, for the signed thumbnails.
 * @param options.itemIds The frames to read for.
 * @param options.now The request's clock, which `expiresAt` counts from.
 */
export async function readBurstFrameSources(
  options: ReadBurstFrameSourcesShape,
): Promise<BurstFrameSources> {
  const [mediaSources, peopleByItemId, settings] = await Promise.all([
    readMediaSources({
      database: options.database,
      b2: options.b2,
      itemIds: options.itemIds,
      now: options.now,
      ttlSeconds: appConfig.media.signedUrlTtlSeconds,
    }),
    readPeopleRefsByItemId({
      database: options.database,
      itemIds: options.itemIds,
    }),
    readInstanceSettings({
      database: options.database,
      keys: ["shoebox.timezone"],
    }),
  ]);

  return {
    mediaSources,
    peopleByItemId,
    timezone: settings["shoebox.timezone"],
  };
}
