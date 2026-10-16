import {
  useWindowVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useCallback } from "react";
import { getIndexesFromTimelineViewport } from "../timelineGeometryHelpers/timelineGeometryHelpers";
import type {
  TimelineAnchor,
  TimelineWindowOptions,
} from "../timelineWindow.types";
import {
  useTimelineAnchorActions,
  useTimelineAnchorEffects,
  useTimelineAnchorState,
} from "../timelineAnchorHelpers/timelineAnchorHelpers";
import {
  recordTimelineMeasurements,
  useTimelineMeasurementRetirement,
  useTimelineMeasurements,
} from "../timelineMeasurementHelpers";
import { useTimelineScroll } from "../useTimelineScroll";
type ConfiguredWindowOptions = {
  options: Readonly<TimelineWindowOptions>;
  sizeAt: (index: number) => number;
  anchor: ReturnType<typeof useTimelineAnchorState>;
  scroll: ReturnType<typeof useTimelineScroll>;
};

type TimelineWindow = {
  virtualizer: Virtualizer<Window, HTMLElement>;
  positions: VirtualItem[];
  measurements: VirtualItem[];
  totalHeight: number;
  saveAnchor: () => TimelineAnchor;
  restoreAnchor: (anchor: TimelineAnchor) => Promise<void>;
};

function useConfiguredWindow({
  options,
  sizeAt,
  anchor,
  scroll,
}: ConfiguredWindowOptions): Virtualizer<Window, HTMLElement> {
  const { rows } = options;
  const { pendingAnchor, isResizing } = anchor;
  const getItemKey = useCallback(
    (index: number) => {
      return rows[index]!.key;
    },
    [rows],
  );
  const virtualizer = useWindowVirtualizer<HTMLElement>({
    count: rows.length,
    getItemKey,
    estimateSize: sizeAt,
    anchorTo: isResizing.current ? "start" : "end",
    followOnAppend: false,
    observeElementOffset: scroll.observeOffset,
    scrollMargin: options.element.current
      ? options.element.current.getBoundingClientRect().top + window.scrollY
      : 0,
    initialRect: { width: window.innerWidth, height: window.innerHeight },
    measureElement: (element) => {
      const height = Math.max(1, element.getBoundingClientRect().height);
      return height;
    },
    rangeExtractor: (range) => {
      return getIndexesFromTimelineViewport({
        rows,
        start: range.startIndex,
        end: range.endIndex,
        focusedItemId: options.focusedItemId ?? pendingAnchor.current?.itemId,
        size: sizeAt,
      });
    },
  });
  _adjustPrecedingRows({ virtualizer, options, anchor });
  return virtualizer;
}

/**
 * Measured window with one explicit anchoring owner and exact-cursor
 * restoration.
 */
export function useTimelineWindow(
  options: Readonly<TimelineWindowOptions>,
): TimelineWindow {
  const cache = useTimelineMeasurements(options);
  const { sizeAt } = cache;
  const anchor = useTimelineAnchorState(options);
  const scroll = useTimelineScroll();
  const { isRetiringMeasurements } = anchor;
  const virtualizer = useConfiguredWindow({ options, sizeAt, anchor, scroll });
  useTimelineMeasurementRetirement({
    options,
    virtualizer,
    measurements: cache,
    isRetiring: isRetiringMeasurements,
  });
  const measurements = recordTimelineMeasurements({
    options,
    virtualizer,
    measurements: cache,
  });
  useTimelineAnchorEffects({
    options,
    virtualizer,
    state: anchor,
    correctOffset: scroll.correctOffset,
    rendered: {
      measurements,
      scrollMargin: virtualizer.options.scrollMargin,
    },
  });
  const actions = useTimelineAnchorActions({
    virtualizer,
    state: anchor,
    correctOffset: scroll.correctOffset,
  });
  return {
    virtualizer,
    positions: virtualizer.getVirtualItems(),
    measurements,
    totalHeight: virtualizer.getTotalSize(),
    ...actions,
  };
}

function _adjustPrecedingRows({
  virtualizer,
  options,
  anchor,
}: {
  virtualizer: Virtualizer<Window, HTMLElement>;
  options: Readonly<TimelineWindowOptions>;
  anchor: ReturnType<typeof useTimelineAnchorState>;
}): void {
  const { rows } = options;
  const { settledAnchor, isResizing } = anchor;
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    const anchorId = settledAnchor.current?.itemId;
    const anchorIndex = rows.findIndex((row) => {
      return anchorId !== undefined && row.itemIds.includes(anchorId);
    });
    return (
      !isResizing.current &&
      options.viewportWidth === window.innerWidth &&
      item.index < anchorIndex
    );
  };
}
