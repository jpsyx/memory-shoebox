import type { MediaSource } from "@memory-shoebox/shared";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** signRenditionRows inputs or output fields. */
type SignRenditionRowsShape = {
  rows: readonly RenditionRow[];
  b2: B2Client;
  now: Date;
  ttlSeconds: number;
};

/** readMediaSources inputs or output fields. */
type ReadMediaSourcesShape = {
  database: DatabaseExecutor;
  b2: B2Client;
  itemIds: readonly string[];
  now: Date;
  ttlSeconds: number;
};

/** One `item_renditions` row, before it is signed. */
type RenditionRow = {
  itemId: string;
  renditionId: string;
  purpose: string;
  storageKey: string;
  width: number;
  height: number;
};

/** One signed rendition, before it is grouped by item id. */
type SignedRendition = {
  itemId: string;
  purpose: string;
  source: MediaSource;
};

/** Gets stable viewing leases after callers have selected visible item IDs. */
async function _signRenditionRows(
  options: SignRenditionRowsShape,
): Promise<SignedRendition[]> {
  return Promise.all(
    options.rows.map(async (row) => {
      const { url, expiresAt } = await options.b2.getMediaLease({
        key: row.storageKey,
        renditionId: row.renditionId,
        now: options.now,
        expiresInSeconds: options.ttlSeconds,
      });
      return {
        itemId: row.itemId,
        purpose: row.purpose,
        source: { url, expiresAt, width: row.width, height: row.height },
      };
    }),
  );
}

/** Groups signed renditions by item id, then by purpose within that item. */
function _groupSignedRenditionsByItemId(
  signed: readonly SignedRendition[],
): Map<string, Map<string, MediaSource>> {
  return signed.reduce<Map<string, Map<string, MediaSource>>>(
    (byItemId, entry) => {
      const sources =
        byItemId.get(entry.itemId) ?? new Map<string, MediaSource>();
      sources.set(entry.purpose, entry.source);
      byItemId.set(entry.itemId, sources);
      return byItemId;
    },
    new Map(),
  );
}

/**
 * Query 5 of a timeline page: every stored object the page draws, signed.
 *
 * One batched `item_renditions WHERE item_id IN (:drawnItemIds)`, **never one
 * join per print**, and keyed by the ids actually drawn, so a collapsed burst
 * costs one item's renditions rather than forty-five.
 *
 * `item_renditions` holds storage **keys**. A URL is a short-lived signed
 * lease reused here for an immutable rendition. A raw storage key in a
 * payload is forbidden outright (`conventions.md` § Forbidden in any payload).
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, faked in tests.
 * @param options.itemIds The ids actually drawn.
 * @param options.now The request clock used to check the signed validity.
 * @param options.ttlSeconds `appConfig.media.signedUrlTtlSeconds`.
 * @returns Sources by item id, then by rendition purpose.
 */
export async function readMediaSources(
  options: ReadMediaSourcesShape,
): Promise<Map<string, Map<string, MediaSource>>> {
  if (options.itemIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_renditions")
    .select([
      "item_renditions.item_id as itemId",
      "item_renditions.id as renditionId",
      "item_renditions.purpose as purpose",
      "item_renditions.storage_key as storageKey",
      "item_renditions.width as width",
      "item_renditions.height as height",
    ])
    .where("item_renditions.item_id", "in", [...options.itemIds])
    .execute();

  const signed = await _signRenditionRows({
    rows,
    b2: options.b2,
    now: options.now,
    ttlSeconds: options.ttlSeconds,
  });

  return _groupSignedRenditionsByItemId(signed);
}
