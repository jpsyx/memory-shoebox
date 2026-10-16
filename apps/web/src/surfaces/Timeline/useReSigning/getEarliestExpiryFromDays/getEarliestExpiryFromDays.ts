import type { MediaSource, TimelineDay } from "@memory-shoebox/shared";

/** Every available signed source carried by one item. */
function _sourcesFromItem(
  media: TimelineDay["items"][number]["media"],
): MediaSource[] {
  return [
    media.thumb,
    media.display,
    media.poster,
    media.playback,
    ...media.displayCandidates,
  ].filter((source) => {
    return source !== null;
  });
}

/**
 * When the first signature on the page stops working.
 *
 * @param days Every day loaded on the page so far.
 * @returns The soonest `expiresAt` across every source, or `undefined` when
 *   the page carries no available signed sources.
 */
export function getEarliestExpiryFromDays(
  days: readonly TimelineDay[],
): string | undefined {
  let earliest: string | undefined = undefined;
  days.forEach((day) => {
    day.items.forEach((item) => {
      _sourcesFromItem(item.media).forEach((source) => {
        if (earliest === undefined || source.expiresAt < earliest) {
          earliest = source.expiresAt;
        }
      });
    });
  });
  return earliest;
}
