import { appConfig } from "../../../../../app.config.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import type { VisibleItem } from "../getVisibleItemOr404.ts";
import {
  readBurstFrameRows,
  type BurstFrameRow,
} from "../readBurstFrameRefs/readBurstFrameRows.ts";
import {
  readBurstFrameTotals,
  type BurstFrameTotals,
} from "../readBurstFrameRefs/readBurstFrameTotals.ts";

/** The two reads a burst costs, and what the payload takes from each. */
export type BurstParts = {
  /** The strip's rows, capped at `appConfig.items.burstStripMaxFrames`. */
  rows: BurstFrameRow[];
  /** The whole visible sibling set, measured uncapped beside the rows. */
  totals: BurstFrameTotals;
  /** This item's 1-based place among those visible siblings. */
  framePosition: number;
};

/**
 * The strip, and the aggregate that says how much of the burst it is showing.
 *
 * Two queries, run together. The rows are capped because a strip of a thousand
 * thumbnails is not a strip; the aggregate is not, because
 * `burst.visibleFrameCount` and `ItemDetail.burstPosition` are read against
 * the whole visible burst and are what send a viewer to
 * `GET /api/bursts/:burstId/frames` for the rest.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.item The item, for its own place in the order.
 * @param options.burstId The burst it sits in.
 */
export async function readBurstParts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  burstId: string;
}): Promise<BurstParts> {
  const [rows, aggregate] = await Promise.all([
    readBurstFrameRows({
      database: options.database,
      viewer: options.viewer,
      burstId: options.burstId,
      limit: appConfig.items.burstStripMaxFrames,
    }),
    readBurstFrameTotals({
      database: options.database,
      viewer: options.viewer,
      burstId: options.burstId,
      frame: {
        itemId: options.item.itemId,
        burstIndex: options.item.burstIndex,
      },
    }),
  ]);

  return {
    rows,
    totals: aggregate.totals,
    framePosition: aggregate.framePosition,
  };
}
