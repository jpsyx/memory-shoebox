import type { BurstFrameRef } from "@memory-shoebox/shared";
import { appConfig } from "../../../../../app.config.ts";
import type { B2Client } from "../../b2/client/client.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import {
  makeBurstFrameCursorFromPageState,
  type BurstFramePageState,
} from "../burstFrameCursorHelpers.ts";
import { makeBurstFrameRefsFromRows } from "./makeBurstFrameRefsFromRows.ts";
import { readBurstFrameRows } from "./readBurstFrameRows.ts";
import { readBurstFrameSources } from "./readBurstFrameSources.ts";

/** One page of a fanned burst, plus the one fact the route's 404 needs. */
export type BurstFramePage = {
  /** Visible frames, numbered on from where the previous page stopped. */
  frames: BurstFrameRef[];
  /** The next page's opaque cursor, or null when this page was the last. */
  nextCursor: string | null;
  /**
   * Visible sibling **rows** this page covered, drawn or not.
   *
   * Zero is the burst this viewer can see nothing of, which is the route's
   * 404. It is counted over rows rather than over `frames` on purpose: a page
   * whose frames were all dropped for missing renditions is an ingest defect,
   * and answering it with "no such burst" would turn one into the other.
   */
  rowCount: number;
};

/**
 * One page of the sibling strip: visible frames, densely numbered, with their
 * thumbnails and their own alt text, and where the next page resumes.
 *
 * A wrapper over the halves this directory holds, for a caller that has only a
 * burst id. `readItemDetail` holds the rows already and calls those halves
 * itself, so the strip and the summary are measured over one row set.
 *
 * **One row past the page is read, and never returned.** That is how "is there
 * another page" is answered without a second count, and it is why `nextCursor`
 * is null on a page that happens to land exactly on the last frame rather than
 * handing out a cursor to an empty page.
 *
 * Four queries for a page of any size: one indexed range scan on
 * `items (burst_id, burst_index)`, then the three
 * {@link readBurstFrameSources} costs.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, for the signed thumbnails.
 * @param options.viewer The request's viewer.
 * @param options.burstId The burst.
 * @param options.now The request's clock, which `expiresAt` counts from.
 * @param options.limit How many frames one page may carry.
 * @param options.cursor Where the previous page stopped, if there was one.
 */
export async function readBurstFramePage(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  burstId: string;
  now: Date;
  limit?: number;
  cursor?: BurstFramePageState;
}): Promise<BurstFramePage> {
  const limit = options.limit ?? appConfig.items.burstStripMaxFrames;
  const rows = await readBurstFrameRows({
    database: options.database,
    viewer: options.viewer,
    burstId: options.burstId,
    limit: limit + 1,
    after:
      options.cursor === undefined
        ? undefined
        : {
            itemId: options.cursor.lastItemId,
            burstIndex: options.cursor.lastBurstIndex,
          },
  });

  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows.at(-1);
  if (lastRow === undefined) {
    return { frames: [], nextCursor: null, rowCount: 0 };
  }

  const drawnFrameCount = options.cursor?.drawnFrameCount ?? 0;
  const frames = makeBurstFrameRefsFromRows({
    rows: pageRows,
    startPosition: drawnFrameCount + 1,
    sources: await readBurstFrameSources({
      database: options.database,
      b2: options.b2,
      now: options.now,
      itemIds: pageRows.map((row) => {
        return row.itemId;
      }),
    }),
  });

  return {
    frames,
    // The cursor points at the last **row** covered, drawn or not, so the next
    // page resumes past a dropped frame instead of meeting it again.
    nextCursor:
      rows.length > limit
        ? makeBurstFrameCursorFromPageState({
            lastBurstIndex: lastRow.burstIndex,
            lastItemId: lastRow.itemId,
            drawnFrameCount: drawnFrameCount + frames.length,
          })
        : null,
    rowCount: pageRows.length,
  };
}
