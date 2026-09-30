import type { BurstSummary } from "@memory-shoebox/shared";
import type { BurstFrameRow } from "./readBurstFrameRefs/readBurstFrameRows.ts";
import type { BurstFrameTotals } from "./readBurstFrameRefs/readBurstFrameTotals.ts";

/**
 * The burst summary for a viewer, from the totals over its visible siblings.
 *
 * There is no stored `frame_count` and the stored span is not used: both are
 * unfiltered and would leak the restricted frames through a denominator or
 * through the endpoints of "06:41 to 06:44".
 *
 * **Every figure comes from `totals`, never from `rows`.** `rows` is the strip
 * the caller will draw, and the permalink's is capped at
 * `appConfig.items.burstStripMaxFrames`; a count taken from it could never
 * exceed the cap, so `visibleFrameCount` could never do the one job it has,
 * which is to tell the client there are more frames than the strip carries and
 * send it to `GET /api/bursts/:burstId/frames`. A capped span is wrong the same
 * way the unfiltered stored one is. `rows` is used for the cover alone.
 *
 * `visibleFrameCount` is the count of **visible** siblings and not of drawn
 * ones, which is the same figure the pile computes in
 * `makeDrawnEntriesFromItemRows`: the two must agree, or one burst reports 45
 * frames in the timeline and 44 on its own permalink. A visible frame whose
 * renditions have gone missing is therefore counted here and dropped from the
 * strip.
 *
 * Fewer than two visible frames is not a burst. One frame renders as a plain
 * print, which is a read-time rule rather than a schema one: the burst row
 * survives, and a `BurstSummary` with `visibleFrameCount: 1` is never served.
 *
 * Shared by `readItemDetail.ts` (one item) and `readItemSummariesByIds.ts` (a
 * selection): the same rule computes both, or a permalink and a refreshed
 * selection could disagree about the same burst. They differ only in where the
 * totals come from, an aggregate query and the uncapped rows respectively.
 *
 * @param options.burstId The burst these siblings belong to.
 * @param options.rows The strip's rows, which may be capped. Cover only.
 * @param options.totals The whole visible sibling set, measured uncapped.
 * @param options.storedCoverItemId `bursts.cover_item_id`, visible or not.
 */
export function makeBurstSummaryFromRows(options: {
  burstId: string;
  rows: readonly BurstFrameRow[];
  totals: BurstFrameTotals;
  storedCoverItemId: string | undefined;
}): BurstSummary | null {
  const { rows, totals } = options;
  const [earliest] = rows;
  // The three undefined checks are one condition: no visible sibling means no
  // span, and a burst of fewer than two is not a burst at all.
  if (
    totals.visibleFrameCount < 2 ||
    earliest === undefined ||
    totals.startsAt === undefined ||
    totals.endsAt === undefined
  ) {
    return null;
  }

  const isCoverVisible = rows.some((row) => {
    return row.itemId === options.storedCoverItemId;
  });

  return {
    burstId: options.burstId,
    visibleFrameCount: totals.visibleFrameCount,
    startsAt: totals.startsAt,
    endsAt: totals.endsAt,
    coverItemId:
      isCoverVisible && options.storedCoverItemId !== undefined
        ? options.storedCoverItemId
        : earliest.itemId,
    hasUnseenFrames: totals.hasUnseenFrames,
  };
}
