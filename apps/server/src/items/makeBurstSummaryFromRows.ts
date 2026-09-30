import type { BurstSummary } from "@memory-shoebox/shared";
import type { BurstFrameRow } from "./readBurstFrameRefs.ts";

/**
 * The burst summary for a viewer, computed from the visible siblings alone.
 *
 * There is no stored `frame_count` and the stored span is not used: both are
 * unfiltered and would leak the restricted frames through a denominator or
 * through the endpoints of "06:41 to 06:44".
 *
 * `visibleFrameCount` is the count of **visible** rows and not of drawn ones,
 * which is the same figure the pile computes in
 * `makeDrawnEntriesFromItemRows`: the two must agree, or one burst reports 45
 * frames in the timeline and 44 on its own permalink. A visible frame whose
 * renditions have gone missing is therefore counted here and dropped from the
 * strip, and `ItemDetail.burstPosition` is numbered over the strip rather than
 * over this count. See the note on `burstPosition` below.
 *
 * Fewer than two visible frames is not a burst. One frame renders as a plain
 * print, which is a read-time rule rather than a schema one: the burst row
 * survives, and a `BurstSummary` with `visibleFrameCount: 1` is never served.
 *
 * Shared by `readItemDetail.ts` (one item) and `readItemSummariesByIds.ts` (a
 * selection): the same rule computes both, or a permalink and a refreshed
 * selection could disagree about the same burst.
 */
export function makeBurstSummaryFromRows(options: {
  burstId: string;
  rows: readonly BurstFrameRow[];
  storedCoverItemId: string | undefined;
}): BurstSummary | null {
  const { rows } = options;
  const [earliest] = rows;
  if (rows.length < 2 || earliest === undefined) {
    return null;
  }

  const capturedAts = rows.map((row) => {
    return row.capturedAt;
  });
  const isCoverVisible = rows.some((row) => {
    return row.itemId === options.storedCoverItemId;
  });

  return {
    burstId: options.burstId,
    visibleFrameCount: rows.length,
    startsAt: capturedAts.reduce((earliestAt, capturedAt) => {
      return capturedAt < earliestAt ? capturedAt : earliestAt;
    }),
    endsAt: capturedAts.reduce((latestAt, capturedAt) => {
      return capturedAt > latestAt ? capturedAt : latestAt;
    }),
    coverItemId:
      isCoverVisible && options.storedCoverItemId !== undefined
        ? options.storedCoverItemId
        : earliest.itemId,
    hasUnseenFrames: rows.some((row) => {
      return row.isUnseen;
    }),
  };
}
