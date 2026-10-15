import { useTimelineRestoration } from "./useTimelineRestoration";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import {
  getAnchorFromTimelineWindow,
  getAnchorNodeFromTimelineWindow,
} from "./timelineGeometry";
import type {
  TimelineAnchor,
  TimelineWindowOptions,
} from "./timelineWindow.types";

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
  )
    isResizing.current = true;
  if (
    latest.current.rows !== options.rows &&
    options.element.current &&
    latest.current.viewportWidth !== 0
  )
    pendingAnchor.current ??= isResizing.current
      ? settledAnchor.current
      : getAnchorFromTimelineWindow(latest.current);
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
): void {
  useLayoutEffect(() => {
    if (state.isRetiringMeasurements.current) {
      state.isRetiringMeasurements.current = false;
      return;
    }
    const anchor = state.pendingAnchor.current;
    state.pendingAnchor.current = undefined;
    if (options.viewportWidth === window.innerWidth)
      state.isResizing.current = false;
    if (!anchor?.itemId) return;
    const node = getAnchorNodeFromTimelineWindow(options, anchor.itemId);
    if (!node) return;
    const delta = node.getBoundingClientRect().top - anchor.offsetPx;
    if (Math.abs(delta) > 0.1)
      correctOffset(virtualizer, window.scrollY + delta);
  });
  useLayoutEffect(() => {
    if (
      !state.pendingAnchor.current &&
      (options.viewportWidth === undefined ||
        options.viewportWidth === window.innerWidth)
    )
      state.settledAnchor.current = getAnchorFromTimelineWindow(
        state.latest.current,
      );
  });
  useEffect(() => {
    const onScroll = () => {
      if (!state.pendingAnchor.current && !state.isResizing.current)
        state.settledAnchor.current = getAnchorFromTimelineWindow(
          state.latest.current,
        );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      return window.removeEventListener("scroll", onScroll);
    };
  }, [
    state.latest,
    state.pendingAnchor,
    state.settledAnchor,
    state.isResizing,
  ]);
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
