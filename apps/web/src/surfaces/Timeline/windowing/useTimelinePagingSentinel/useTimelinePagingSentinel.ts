import { useEffect, useRef, type RefObject } from "react";
type TimelinePagingSentinelOptions = {
  sentinelRef: RefObject<HTMLDivElement | null>;
  onReachEnd: () => void;
  hasMore: boolean;
  isFetching?: boolean;
};

/**
 * Asks for the next page when the sentinel comes into view.
 *
 * The sentinel is an element rather than a scroll listener: an observer fires
 * off the main thread's critical path and needs no throttling, and a scroll
 * listener on a page this long is the thing that makes it feel heavy.
 *
 * `rootMargin` asks a screen early, so the next page is usually already there
 * by the time somebody reaches the foot of this one.
 */
export function useTimelinePagingSentinel(
  options: Readonly<TimelinePagingSentinelOptions>,
): void {
  const { sentinelRef, onReachEnd, hasMore, isFetching } = options;
  const viewportHeight = window.innerHeight;
  // Held in a ref so the observer is created once rather than on every render
  // that changes the callback's identity, which is every render.
  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;

  useEffect(
    function watchTheSentinelForTheNextPage() {
      const sentinel = sentinelRef.current;
      if (sentinel === null || !hasMore || isFetching) {
        return;
      }
      let isActive = true;
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            isActive &&
            entries.some((entry) => {
              return entry.isIntersecting;
            })
          ) {
            onReachEndRef.current();
          }
        },
        { rootMargin: `${viewportHeight}px 0px` },
      );
      observer.observe(sentinel);
      return () => {
        isActive = false;
        observer.disconnect();
      };
    },
    [hasMore, isFetching, sentinelRef, viewportHeight],
  );
}
