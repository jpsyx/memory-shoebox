import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { ItemSummary, TimelineDay } from "@memory-shoebox/shared";
import { DayBlock } from "@/surfaces/Timeline/DayBlock/DayBlock";

type Props = {
  days: readonly TimelineDay[];
  countLabel: string | undefined;
  framesByBurstId: ReadonlyMap<string, readonly ItemSummary[]>;
  onOpenBurst: (burstId: string) => void;
  /** Asks for the next page. A no-op once there is none. */
  onReachEnd: () => void;
  hasMore: boolean;
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
function useNextPage(options: {
  sentinelRef: RefObject<HTMLDivElement | null>;
  onReachEnd: () => void;
  hasMore: boolean;
}): void {
  const { sentinelRef, onReachEnd, hasMore } = options;
  // Held in a ref so the observer is created once rather than on every render
  // that changes the callback's identity, which is every render.
  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || !hasMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => {
            return entry.isIntersecting;
          })
        ) {
          onReachEndRef.current();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, sentinelRef]);
}

/** Every loaded day, with a sentinel that asks for the next page. */
export function DayStream({
  days,
  countLabel,
  framesByBurstId,
  onOpenBurst,
  onReachEnd,
  hasMore,
}: Readonly<Props>): ReactNode {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useNextPage({ sentinelRef, onReachEnd, hasMore });

  return (
    <>
      {days.map((day) => {
        return (
          <DayBlock
            key={day.capturedOn}
            day={day}
            countLabel={countLabel}
            framesByBurstId={framesByBurstId}
            onOpenBurst={onOpenBurst}
          />
        );
      })}
      <div ref={sentinelRef} aria-hidden="true" />
    </>
  );
}
