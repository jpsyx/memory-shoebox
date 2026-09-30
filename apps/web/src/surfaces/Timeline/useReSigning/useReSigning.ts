import { useEffect } from "react";
import type { TimelineDay } from "@memory-shoebox/shared";
import { getEarliestExpiryFromDays } from "@/surfaces/Timeline/useReSigning/getEarliestExpiryFromDays";

/** A moment before the signature dies, so a scroll never meets a dead URL. */
const MARGIN_MS = 30_000;

/**
 * Refetches the page in place when its signed URLs are about to expire.
 *
 * `timeline.md` Ruling 3: there is no re-signing route and none is wanted. A
 * dedicated one would need its own visibility evaluation and its own answer
 * for an item that became invisible while the page sat there; refetching
 * gets both for free and correct.
 *
 * **"Merge by id" is React's own reconciliation.** TanStack Query replaces
 * every loaded page together and each print is keyed by `itemId`, so no node
 * is unmounted, nothing above the viewport changes height, and the scroll
 * offset survives because nothing navigated.
 *
 * One timer for the page rather than one per source: a hundred timers for a
 * fact that moves once an hour is a hundred things to clear on unmount.
 *
 * @param options.days Every day loaded on the page so far.
 * @param options.onExpire Called once, when the soonest signature is about
 *   to stop working.
 */
export function useReSigning(options: {
  days: readonly TimelineDay[];
  onExpire: () => void;
}): void {
  const earliest = getEarliestExpiryFromDays(options.days);
  const onExpire = options.onExpire;

  useEffect(() => {
    if (earliest === undefined) {
      return undefined;
    }
    const delay = Date.parse(earliest) - Date.now() - MARGIN_MS;
    // A signature already past is refetched at once rather than never: a tab
    // woken from sleep is exactly this case.
    const timer = setTimeout(onExpire, Math.max(delay, 0));
    return () => {
      clearTimeout(timer);
    };
    // `onExpire` is stable at the call site, which is what keeps this to one
    // timer rather than one per render.
  }, [earliest, onExpire]);
}
