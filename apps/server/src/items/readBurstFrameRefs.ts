import type {
  BurstFrameRef,
  MediaSource,
  PersonRef,
} from "@memory-shoebox/shared";
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
  /** No `item_views` row for this viewer, which is what the dot draws. */
  isUnseen: boolean;
};

/**
 * Every sibling of one burst this viewer may see, oldest first.
 *
 * Ordered `(burst_index ASC, id ASC)`. `burst_index` is 1-based and nullable,
 * and a null sorts last, ahead of nothing: SQLite's own default puts a null
 * first on an ascending sort, so the direction carries an explicit
 * `nulls last` rather than relying on that default.
 *
 * The anti-join to `item_views` rides along rather than costing a query of its
 * own, because `BurstSummary.hasUnseenFrames` is a fact about the same rows.
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
  // The predicate is applied before the join, not after: a left join rewrites
  // the joined table's columns to nullable inside the query's own schema, and
  // `applyVisibilityFilter` is generic over the unaltered `Database`. Both
  // orders compile to the same statement, because a builder's call order is
  // not the clause order.
  const visibleFrames = applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.captured_at as capturedAt",
        "items.alt_text as altTextOverride",
      ])
      .where("items.burst_id", "=", options.burstId),
  });

  const rows = await visibleFrames
    // The member predicate belongs in the `ON` and never in the `WHERE`, or
    // the anti-join turns inner and every seen frame disappears.
    .leftJoin("item_views", (join) => {
      return join
        .onRef("item_views.item_id", "=", "items.id")
        .on("item_views.member_id", "=", options.viewer.memberId);
    })
    .select("item_views.item_id as seenItemId")
    .orderBy("items.burst_index", (orderBy) => {
      return orderBy.asc().nullsLast();
    })
    .orderBy("items.id", "asc")
    .limit(options.limit)
    .execute();

  return rows.map((row) => {
    return {
      itemId: row.itemId,
      capturedAt: row.capturedAt,
      altTextOverride: row.altTextOverride,
      isUnseen: row.seenItemId === null,
    };
  });
}

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
 * {@link makeBurstFrameRefsFromRows} instead**, because `items.md`
 * § Performance queries 3 and 6 are each one batched read covering the item
 * **and** the strip, not two.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, for the signed thumbnails.
 * @param options.itemIds The frames to read for.
 * @param options.now The request's clock, which `expiresAt` counts from.
 */
export async function readBurstFrameSources(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  itemIds: readonly string[];
  now: Date;
}): Promise<BurstFrameSources> {
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

/**
 * Visible sibling rows to the strip the viewer sees: signed, numbered, and
 * carrying each frame's own alt text.
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
 * pile, not a new one this reader has to close. `ItemDetail.burstPosition` is
 * read straight off the frame this returns for the item, so the caption and
 * the strip cannot disagree about which frame is which.
 *
 * **No queries of its own.** It composes what it is handed, so a caller whose
 * payload already covers the item and the strip pays for the renditions, the
 * people and the timezone once rather than twice.
 *
 * @param options.rows The visible siblings, from `readBurstFrameRows`.
 * @param options.sources The three batched reads, covering at least `rows`.
 */
export function makeBurstFrameRefsFromRows(options: {
  rows: readonly BurstFrameRow[];
  sources: BurstFrameSources;
}): BurstFrameRef[] {
  const { rows, sources } = options;

  // Built without a position first: a frame dropped here for a missing
  // thumbnail must not reserve a number nobody gets, or the gap tells the
  // viewer exactly what `position` exists to hide.
  const drawableFrames = rows.flatMap((row) => {
    const renditions = sources.mediaSources.get(row.itemId);
    const thumb = renditions?.get("thumb") ?? renditions?.get("display");
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
          personNames: (sources.peopleByItemId.get(row.itemId) ?? []).map(
            (person) => {
              return person.displayName;
            },
          ),
          capturedAt: row.capturedAt,
          timezone: sources.timezone,
        }),
      },
    ];
  });

  return drawableFrames.map((frame, index) => {
    return { ...frame, position: index + 1 };
  });
}

/**
 * The sibling strip: visible frames, densely numbered, with their thumbnails
 * and their own alt text.
 *
 * A thin wrapper over the two halves above, for a caller that holds only a
 * burst id. `readItemDetail` holds the rows already, and calls the two halves
 * itself so the strip and the summary are measured over one row set.
 *
 * Four queries for a strip of any size: one indexed range scan on
 * `items (burst_id, burst_index)`, then the three
 * {@link readBurstFrameSources} costs.
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

  return makeBurstFrameRefsFromRows({
    rows,
    sources: await readBurstFrameSources({
      database: options.database,
      b2: options.b2,
      now: options.now,
      itemIds: rows.map((row) => {
        return row.itemId;
      }),
    }),
  });
}
