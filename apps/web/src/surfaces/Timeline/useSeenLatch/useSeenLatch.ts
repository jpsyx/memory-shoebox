import { useCallback, useEffect, useRef, type RefCallback } from "react";
import type { ItemsSeenRequest } from "@memory-shoebox/shared";
import { getSeenRequestFromSightings, type Sighting } from "@/api/seen/seen";

/** How long sightings collect before they are sent, in milliseconds. */
const FLUSH_DELAY_MS = 500;

/** How a print or a collapsed stack announces itself in the DOM. */
const PRINT_SELECTOR = "[data-item-id],[data-burst-id]";

/** Reads the id and kind a print or a stack wrote onto itself. */
function _sightingFromTarget(options: {
  target: Element;
  unseenById: ReadonlyMap<string, boolean>;
}): Sighting | undefined {
  const { target, unseenById } = options;
  if (!(target instanceof HTMLElement)) {
    return undefined;
  }
  const itemId = target.dataset.itemId;
  const burstId = target.dataset.burstId;
  const id = itemId ?? burstId;
  if (id === undefined) {
    return undefined;
  }
  return {
    kind: itemId === undefined ? "burst" : "item",
    id,
    hasUnseen: unseenById.get(id) === true,
  };
}

/** What one batch of intersection entries is worth, the misses dropped. */
function _sightingsFromEntries(options: {
  entries: readonly IntersectionObserverEntry[];
  unseenById: ReadonlyMap<string, boolean>;
}): Sighting[] {
  const { entries, unseenById } = options;
  return entries
    .filter((entry) => {
      return entry.isIntersecting;
    })
    .map((entry) => {
      return _sightingFromTarget({ target: entry.target, unseenById });
    })
    .filter((sighting): sighting is Sighting => {
      return sighting !== undefined;
    });
}

/** Hands every print already inside `root` to the intersection observer. */
function _observePrints(options: {
  root: ParentNode;
  observer: IntersectionObserver;
}): void {
  const { root, observer } = options;
  root.querySelectorAll(PRINT_SELECTOR).forEach((print) => {
    observer.observe(print);
  });
}

/** Hands every print that lands later to the same intersection observer. */
function _makeArrivalObserver(
  observer: IntersectionObserver,
): MutationObserver {
  return new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        // The node itself may be a print, and it may also hold some: a page
        // arrives as a day block wrapping its own prints.
        if (node.matches(PRINT_SELECTOR)) {
          observer.observe(node);
        }
        _observePrints({ root: node, observer });
      });
    });
  });
}

/**
 * Watches one element, and everything that arrives in it afterwards.
 *
 * @returns The cleanup that disconnects both observers. React 19 calls
 *   whatever a ref callback returns when the element is detached, and that is
 *   the only place these two can be disconnected: nothing else on the surface
 *   knows they exist.
 */
function _watchPrints(options: {
  element: HTMLElement;
  onEntries: (entries: readonly IntersectionObserverEntry[]) => void;
}): () => void {
  const { element, onEntries } = options;
  const observer = new IntersectionObserver(onEntries);
  _observePrints({ root: element, observer });

  const arrivals = _makeArrivalObserver(observer);
  arrivals.observe(element, { childList: true, subtree: true });

  return () => {
    arrivals.disconnect();
    observer.disconnect();
  };
}

/**
 * The batch waiting to be posted, and the timer that posts it.
 *
 * **Steady-state browsing costs zero requests.** The batch is dropped
 * entirely when nothing in it is unseen, which the client knows from
 * `isUnseen` and `hasUnseenFrames` without asking, so a familiar archive
 * generates no traffic on this route at all.
 *
 * @returns What to hand each batch of intersection entries to. Its identity
 *   is stable, so the observer is never rebuilt by a render.
 */
function useSightingBuffer(options: {
  unseenById: ReadonlyMap<string, boolean>;
  onLatch: (body: ItemsSeenRequest) => void;
}): (entries: readonly IntersectionObserverEntry[]) => void {
  const pending = useRef<Sighting[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Both change on most renders, and neither should rebuild the observer.
  const latest = useRef(options);
  latest.current = options;

  const flush = useCallback(() => {
    const batch = pending.current;
    pending.current = [];
    const body = getSeenRequestFromSightings(batch);
    if (body !== undefined) {
      latest.current.onLatch(body);
    }
  }, []);

  useEffect(function dropThePendingFlushOnUnmount() {
    return () => {
      clearTimeout(timer.current);
    };
  }, []);

  return useCallback(
    (entries) => {
      pending.current.push(
        ..._sightingsFromEntries({
          entries,
          unseenById: latest.current.unseenById,
        }),
      );
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, FLUSH_DELAY_MS);
    },
    [flush],
  );
}

/**
 * Watches every print in the archive and latches the ones somebody passes.
 *
 * One observer for the whole pile rather than one per print: the prints
 * announce themselves in the DOM with `data-item-id` and `data-burst-id`, so
 * a three-hundred item day costs one observer and no refs.
 *
 * **The prints are not there when the archive mounts.** The day stream is
 * still in flight on a cold load, and the infinite scroll appends another
 * page each time somebody reaches the foot of this one, so a query run once
 * at mount watches an empty pile and nothing that lands in it afterwards. A
 * `MutationObserver` on the same element hands every arrival to the same
 * intersection observer, which is what makes the dots go out on a first
 * page load rather than only on a return to a pile the cache still holds.
 *
 * @param options.unseenById Whether each item or burst on the page is
 *   unseen.
 * @param options.onLatch Called with what to post, never with an empty
 *   batch.
 * @returns A ref for the element containing the prints.
 */
export function useSeenLatch(options: {
  unseenById: ReadonlyMap<string, boolean>;
  onLatch: (body: ItemsSeenRequest) => void;
}): RefCallback<HTMLElement> {
  const onEntries = useSightingBuffer(options);

  return useCallback(
    (element: HTMLElement | null) => {
      if (element === null) {
        return;
      }
      return _watchPrints({ element, onEntries });
    },
    [onEntries],
  );
}
