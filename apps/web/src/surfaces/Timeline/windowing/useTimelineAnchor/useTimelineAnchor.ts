import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import {
  getAnchorFromTimelineWindow,
  getAnchorNodeFromTimelineWindow,
} from "../timelineGeometry";
import type {
  TimelineAnchor,
  TimelineWindowOptions,
} from "../timelineWindow.types";
import { useTimelineRestoration } from "../useTimelineRestoration/useTimelineRestoration";

type WindowVirtualizer = Virtualizer<Window, HTMLElement>;
type AnchorState = {
  latest: RefObject<Readonly<TimelineWindowOptions>>;
  pendingAnchor: RefObject<TimelineAnchor | undefined>;
  settledAnchor: RefObject<TimelineAnchor | undefined>;
  isResizing: RefObject<boolean>;
  isRetiringMeasurements: RefObject<boolean>;
};

/** Captures structural changes before React replaces the prior row geometry. */
export function useTimelineAnchorState(
  options: Readonly<TimelineWindowOptions>,
): AnchorState {
  const latest = useRef(options);
  const pendingAnchor = useRef<TimelineAnchor | undefined>(undefined);
  const settledAnchor = useRef<TimelineAnchor | undefined>(undefined);
  const isResizing = useRef(false);
  const isRetiringMeasurements = useRef(false);
  if (latest.current.viewKey !== options.viewKey) {
    pendingAnchor.current = undefined;
    settledAnchor.current = undefined;
  }
  if (
    (latest.current.viewportWidth ?? 0) > 0 &&
    latest.current.viewportWidth !== window.innerWidth
  ) {
    isResizing.current = true;
  }
  if (
    latest.current.viewKey === options.viewKey &&
    latest.current.rows !== options.rows &&
    options.element.current &&
    latest.current.viewportWidth !== 0
  ) {
    pendingAnchor.current ??= isResizing.current
      ? settledAnchor.current
      : getAnchorFromTimelineWindow(latest.current);
  }
  latest.current = options;
  return {
    latest,
    pendingAnchor,
    settledAnchor,
    isResizing,
    isRetiringMeasurements,
  };
}

/** Applies one structural correction after public measurement retirement completes. */
export function useTimelineAnchorEffects(
  options: Readonly<TimelineWindowOptions>,
  virtualizer: WindowVirtualizer,
  state: AnchorState,
  correctOffset: (virtualizer: WindowVirtualizer, offset: number) => void,
  rendered: { measurements: readonly VirtualItem[]; scrollMargin: number },
): void {
  useLayoutEffect(() => {
    if (state.isRetiringMeasurements.current) {
      state.isRetiringMeasurements.current = false;
      return;
    }
    const anchor = state.pendingAnchor.current;
    if (
      anchor?.itemId &&
      !_hasCommittedAnchorPosition(
        options,
        virtualizer,
        rendered,
        anchor.itemId,
      )
    ) {
      return;
    }
    state.pendingAnchor.current = undefined;
    if (options.viewportWidth === window.innerWidth) {
      state.isResizing.current = false;
    }
    if (!anchor?.itemId) {
      return;
    }
    const node = getAnchorNodeFromTimelineWindow(options, anchor.itemId);
    if (!node) {
      return;
    }
    const delta = node.getBoundingClientRect().top - anchor.offsetPx;
    if (Math.abs(delta) > 0.1) {
      correctOffset(virtualizer, window.scrollY + delta);
    }
  });
  useLayoutEffect(() => {
    if (
      !state.pendingAnchor.current &&
      (options.viewportWidth === undefined ||
        options.viewportWidth === window.innerWidth)
    ) {
      state.settledAnchor.current = getAnchorFromTimelineWindow(
        state.latest.current,
      );
    }
  });
  useTimelineAnchorObservation(state);
}

function _isReadingKey(key: string): boolean {
  return [
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
    "Tab",
  ].includes(key);
}

function useTimelineAnchorObservation(state: AnchorState): void {
  useEffect(() => {
    const onReadingIntent = (event: Event) => {
      if (event instanceof KeyboardEvent && !_isReadingKey(event.key)) {
        return;
      }
      state.pendingAnchor.current = undefined;
    };
    const onScroll = () => {
      if (!state.pendingAnchor.current && !state.isResizing.current) {
        state.settledAnchor.current = getAnchorFromTimelineWindow(
          state.latest.current,
        );
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onReadingIntent, { passive: true });
    window.addEventListener("touchstart", onReadingIntent, { passive: true });
    window.addEventListener("keydown", onReadingIntent);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onReadingIntent);
      window.removeEventListener("touchstart", onReadingIntent);
      window.removeEventListener("keydown", onReadingIntent);
    };
  }, [
    state.latest,
    state.pendingAnchor,
    state.settledAnchor,
    state.isResizing,
  ]);
}

/** Ref measurements may update Virtual before React has painted their row starts. */
function _hasCommittedAnchorPosition(
  options: Readonly<TimelineWindowOptions>,
  virtualizer: WindowVirtualizer,
  rendered: { measurements: readonly VirtualItem[]; scrollMargin: number },
  itemId: string,
): boolean {
  const row = options.rows.find((candidate) => {
    return candidate.itemIds.includes(itemId);
  });
  // Removed or unmounted reading rows retire the old correction normally.
  if (!row) {
    return true;
  }
  if (
    options.viewportWidth !== undefined &&
    options.viewportWidth !== window.innerWidth
  ) {
    return false;
  }
  const painted = rendered.measurements.find((position) => {
    return position.key === row.key;
  });
  // The public visible list also includes estimated entries after measure().
  const current = virtualizer.getVirtualItems().find((position) => {
    return position.key === row.key;
  });
  if (!painted || !current) {
    return true;
  }
  return (
    Math.abs(
      painted.start -
        rendered.scrollMargin -
        (current.start - virtualizer.options.scrollMargin),
    ) <= 0.1
  );
}

/** Stable navigation callbacks read current rows and fence retired DOM/view owners. */
export function useTimelineAnchorActions(
  virtualizer: WindowVirtualizer,
  state: AnchorState,
  correctOffset: (virtualizer: WindowVirtualizer, offset: number) => void,
): {
  saveAnchor: () => TimelineAnchor;
  restoreAnchor: (anchor: TimelineAnchor) => Promise<void>;
} {
  const { latest } = state;
  const saveAnchor = useCallback(() => {
    return getAnchorFromTimelineWindow(latest.current);
  }, [latest]);
  const restoreAnchor = useTimelineRestoration(
    latest.current,
    virtualizer,
    correctOffset,
  );
  return { saveAnchor, restoreAnchor };
}
