import type { BurstFrameRef } from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { makeAltTextFromItem } from "../archive/makeAltTextFromItem.ts";
import { readMediaSources } from "../archive/readMediaSources.ts";
import { readPeopleRefsByItemId } from "../archive/readPeopleRefsByItemId.ts";
import type { B2Client } from "../b2/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

/** One visible sibling, before it is signed and numbered. */
export type BurstFrameRow = {
  itemId: string;
  capturedAt: string;
  altTextOverride: string | null;
};

/**
 * Every sibling of one burst this viewer may see, oldest first.
 *
 * Ordered `(burst_index ASC, id ASC)`. `burst_index` is 1-based and nullable,
 * and a null sorts last, ahead of nothing: SQLite's own default puts a null
 * first on an ascending sort, so the direction carries an explicit
 * `nulls last` rather than relying on that default.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.burstId The burst.
 * @param options.limit How many rows to take.
 */
export async function readBurstFrameRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  burstId: string;
  limit: number;
}): Promise<BurstFrameRow[]> {
  return applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.captured_at as capturedAt",
        "items.alt_text as altTextOverride",
      ])
      .where("items.burst_id", "=", options.burstId),
  })
    .orderBy("items.burst_index", (orderBy) => {
      return orderBy.asc().nullsLast();
    })
    .orderBy("items.id", "asc")
    .limit(options.limit)
    .execute();
}

/**
 * The sibling strip: visible frames, densely numbered, with their thumbnails
 * and their own alt text.
 *
 * **`position` is 1-based and dense over the frames actually returned, and is
 * never `items.burst_index`.** This is where a restricted frame would leak:
 * pass the stored index through and frames 6, 8, 9 tell the viewer there is a
 * frame 7 they may not open. A gap is a count of what you cannot see.
 *
 * That holds even for a frame this viewer may see but that this route cannot
 * draw, because its renditions are missing. To the viewer, a numbering gap
 * reads the same whatever caused it: "there is something here I cannot open".
 * So `position` is assigned only once a frame has cleared every reason it
 * might be dropped, over the frames that made it into the response, never
 * over the row list a drop was taken from. `visibleFrameCount`, computed
 * elsewhere from the same visibility-filtered rows, may still count a frame
 * this function had to drop for missing renditions: that mismatch is the same
 * accepted defect `readItemSummariesByDay` already logs and survives for the
 * pile, not a new one this reader has to close.
 *
 * Three queries for a strip of any size beyond the range scan below: one
 * indexed range scan on `items (burst_id, burst_index)`, one batched
 * rendition query, one batched people query for the alt text, and one read of
 * the timezone setting the alt text's date is rendered in.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, for the signed thumbnails.
 * @param options.viewer The request's viewer.
 * @param options.burstId The burst.
 * @param options.now The request's clock, which `expiresAt` counts from.
 * @param options.limit How many frames to return.
 */
export async function readBurstFrameRefs(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  burstId: string;
  now: Date;
  limit?: number;
}): Promise<BurstFrameRef[]> {
  const rows = await readBurstFrameRows({
    database: options.database,
    viewer: options.viewer,
    burstId: options.burstId,
    limit: options.limit ?? appConfig.items.burstStripMaxFrames,
  });

  if (rows.length === 0) {
    return [];
  }

  const itemIds = rows.map((row) => {
    return row.itemId;
  });

  const [mediaSources, peopleByItemId, settings] = await Promise.all([
    readMediaSources({
      database: options.database,
      b2: options.b2,
      itemIds,
      now: options.now,
      ttlSeconds: appConfig.media.signedUrlTtlSeconds,
    }),
    readPeopleRefsByItemId({ database: options.database, itemIds }),
    readInstanceSettings({
      database: options.database,
      keys: ["shoebox.timezone"],
    }),
  ]);

  // Built without a position first: a frame dropped here for a missing
  // thumbnail must not reserve a number nobody gets, or the gap tells the
  // viewer exactly what `position` exists to hide.
  const drawableFrames = rows.flatMap((row) => {
    const sources = mediaSources.get(row.itemId);
    const thumb = sources?.get("thumb") ?? sources?.get("display");
    if (thumb === undefined) {
      // Counted by `visibleFrameCount` and not drawn, which is the same shape
      // the pile already uses for an item whose renditions have gone missing.
      return [];
    }

    return [
      {
        itemId: row.itemId,
        thumb,
        altText: makeAltTextFromItem({
          altTextOverride: row.altTextOverride,
          personNames: (peopleByItemId.get(row.itemId) ?? []).map(
            (person) => {
              return person.displayName;
            },
          ),
          capturedAt: row.capturedAt,
          timezone: settings["shoebox.timezone"],
        }),
      },
    ];
  });

  return drawableFrames.map((frame, index) => {
    return { ...frame, position: index + 1 };
  });
}
