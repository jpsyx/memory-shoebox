import { useCallback, useEffect, useRef } from "react";
import type { ItemsSeenRequest } from "@memory-shoebox/shared";
import { getSeenRequestFromSightings, type Sighting } from "@/api/items/seen";

/** How long sightings collect before they are sent, in milliseconds. */
const FLUSH_DELAY_MS = 500;

/** Reads the id and kind a print or a stack wrote onto itself. */
function _sightingFromTarget(
  target: Element,
  unseenById: ReadonlyMap<string, boolean>,
): Sighting | undefined {
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

/**
 * Watches every print in the archive and latches the ones somebody passes.
 *
 * One observer for the whole pile rather than one per print: the prints
 * announce themselves in the DOM with `data-item-id` and `data-burst-id`, so
 * a three-hundred item day costs one observer and no refs.
 *
 * **Steady-state browsing costs zero requests.** The batch is dropped
 * entirely when nothing in it is unseen, which the client knows from
 * `isUnseen` and `hasUnseenFrames` without asking, so a familiar archive
 * generates no traffic on this route at all.
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
}): (element: HTMLElement | null) => void {
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

  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
    };
  }, []);

  return useCallback(
    (element: HTMLElement | null) => {
      if (element === null) {
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        const sightings = entries
          .filter((entry) => {
            return entry.isIntersecting;
          })
          .map((entry) => {
            return _sightingFromTarget(entry.target, latest.current.unseenById);
          })
          .filter((sighting): sighting is Sighting => {
            return sighting !== undefined;
          });
        pending.current.push(...sightings);
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, FLUSH_DELAY_MS);
      });
      element
        .querySelectorAll("[data-item-id],[data-burst-id]")
        .forEach((print) => {
          observer.observe(print);
        });
    },
    [flush],
  );
}
