import type { MediaSource } from "@memory-shoebox/shared";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** One `item_renditions` row, before it is signed. */
type RenditionRow = {
  itemId: string;
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

/**
 * Signs every rendition row against B2, one HMAC per row.
 *
 * A 400-item page can carry more than a thousand renditions, so this
 * `Promise.all` can mean more than a thousand `presignGet` calls in one go.
 * Signing is CPU-bound HMAC with no network wait, so `Promise.all` buys no
 * real concurrency here: it only avoids a hand-written loop. If the
 * timeline's own latency is ever dominated by signing rather than by the
 * query beside it, this is the place to look.
 */
async function _signRenditionRows(options: {
  rows: readonly RenditionRow[];
  b2: B2Client;
  now: Date;
  ttlSeconds: number;
}): Promise<SignedRendition[]> {
  const expiresAt = new Date(
    options.now.getTime() + options.ttlSeconds * 1000,
  ).toISOString();

  return Promise.all(
    options.rows.map(async (row) => {
      const url = await options.b2.presignGet({
        key: row.storageKey,
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
 * thing minted here at render, because a raw storage key in a payload is
 * forbidden outright (`conventions.md` § Forbidden in any payload).
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, faked in tests.
 * @param options.itemIds The ids actually drawn.
 * @param options.now The request's own clock, which `expiresAt` counts from.
 * @param options.ttlSeconds `appConfig.media.signedUrlTtlSeconds`.
 * @returns Sources by item id, then by rendition purpose.
 */
export async function readMediaSources(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  itemIds: readonly string[];
  now: Date;
  ttlSeconds: number;
}): Promise<Map<string, Map<string, MediaSource>>> {
  if (options.itemIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_renditions")
    .select([
      "item_renditions.item_id as itemId",
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
