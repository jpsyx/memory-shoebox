import type { MediaSource, TimelineDay } from "@memory-shoebox/shared";

/** Every source one item carries a signature for, some of them nullable. */
function _sourcesFromItem(
  media: TimelineDay["items"][number]["media"],
): Array<MediaSource | null> {
  return [
    media.thumb,
    media.display,
    media.poster,
    media.video?.webm ?? null,
    media.video?.mp4 ?? null,
  ];
}

/**
 * When the first signature on the page stops working.
 *
 * ISO-8601 with a `Z` sorts lexicographically in the same order it sorts
 * chronologically, so the comparison needs no parsing.
 *
 * @param days Every day loaded on the page so far.
 * @returns The soonest `expiresAt` across every source, or `undefined` when
 *   the page holds no items at all.
 */
export function getEarliestExpiryFromDays(
  days: readonly TimelineDay[],
): string | undefined {
  let earliest: string | undefined = undefined;
  days.forEach((day) => {
    day.items.forEach((item) => {
      _sourcesFromItem(item.media).forEach((source) => {
        if (
          source !== null &&
          (earliest === undefined || source.expiresAt < earliest)
        ) {
          earliest = source.expiresAt;
        }
      });
    });
  });
  return earliest;
}
