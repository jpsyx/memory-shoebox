import type { FastifyReply, FastifyRequest } from "fastify";
import { itemIdParamsSchema, type ItemDetail } from "@memory-shoebox/shared";
import { appConfig } from "../../../../../app.config.ts";
import { latchItemsSeen } from "../../archive/latchItemsSeen.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import { latchItemOpened } from "../../items/latchItemOpened.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";

/**
 * `GET /items/:itemId`: the permalink, in one response.
 *
 * The latch that clears the pile's accent dot lives here too, and nowhere
 * else: this is the one route that counts an open.
 */
export async function getItem(request: FastifyRequest): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const now = request.server.clock();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });

  const detail = await readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item,
    now,
  });

  // Both latches run after the reads are assembled and outside the read
  // work, so a page of reads never holds SQLite's single writer, and
  // `isUnseen` above reports the state the viewer arrived in.
  await latchItemOpened({
    database: request.server.database,
    memberId: viewer.memberId,
    itemId: item.itemId,
    now: now.toISOString(),
  });

  if (item.burstId !== null) {
    // `first_seen_at` for every visible sibling, in one batched
    // statement (`items.md` Ruling 6). A thumbnail in the strip has been
    // in front of the viewer; it was not opened at full size.
    await latchItemsSeen({
      database: request.server.database,
      viewer,
      itemIds: [],
      burstIds: [item.burstId],
      now: now.toISOString(),
    });
  }

  return detail;
}

/**
 * `GET /items/:itemId/original`: the download.
 *
 * `items.md`'s design left "Download the original" open between widening the
 * frozen `MediaRef` with an `original` member and a dedicated route, and the
 * route won: a `MediaRef` addition would put a full-resolution signed URL on
 * every print in every timeline page for a button that appears on one surface,
 * and only a route can carry a sensible filename into the download.
 */
export async function getItemOriginal(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });

  const rendition = await request.server.database
    .selectFrom("item_renditions")
    .select("item_renditions.storage_key as storageKey")
    .where("item_renditions.item_id", "=", item.itemId)
    .where("item_renditions.purpose", "=", "original")
    .executeTakeFirst();

  if (rendition === undefined) {
    // An ingest defect rather than a permission fact, and the same 404
    // either way: the caller learns nothing about which it was.
    request.log.warn({ itemId }, "an item has no original to download");
    throw ApiError.notFound("item_not_found");
  }

  // A redirect rather than a payload field: widening `MediaRef` would put
  // a full-resolution signed URL on every print in every timeline page
  // for a button that appears on one surface, and a payload field cannot
  // get a sensible filename into the download.
  return reply
    .code(302)
    .header(
      "location",
      await request.server.b2.presignGet({
        key: rendition.storageKey,
        expiresInSeconds: appConfig.media.signedUrlTtlSeconds,
        downloadFilename: item.originalFilename ?? `${item.itemId}.jpg`,
      }),
    )
    .send();
}
