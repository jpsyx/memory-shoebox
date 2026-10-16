import {
  type RefObject,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";

import {
  PileSelectionContext,
  type PileSelection,
} from "@/system/Pile/PileSelection/PileSelection";

import { getTimelineRowsFromDays } from "../windowing/getTimelineRowsFromDays/getTimelineRowsFromDays";

import {
  useTimelineExpansionSizes,
  useTimelineFanRestoration,
} from "../windowing/timelineFanHelpers";

import { useTimelineFocus } from "../windowing/useTimelineFocus/useTimelineFocus";

import { useTimelineLayout } from "../windowing/useTimelineLayout";

import { useTimelinePagingSentinel } from "../windowing/useTimelinePagingSentinel/useTimelinePagingSentinel";

import { useTimelinePosition } from "../windowing/useTimelinePosition";

import { useTimelineWindow } from "../windowing/useTimelineWindow/useTimelineWindow";
import type { Props, RootRef } from "./DayStream.types";
import { StreamBody } from "./StreamBody/StreamBody";
type BurstCollapseOptions = {
  props: Readonly<Props>;
  stream: Stream;
  element: RootRef;
  burstId: string;
};

type StreamRows = {
  layout: ReturnType<typeof useTimelineLayout>;
  selection: PileSelection | undefined;
  focus: ReturnType<typeof useTimelineFocus>;
  rows: ReturnType<typeof useTimelineFocus>["rows"];
};

function useStreamRows({
  props,
  element,
}: {
  props: Readonly<Props>;
  element: RootRef;
}): StreamRows {
  const layout = useTimelineLayout(element);
  const selection = useContext(PileSelectionContext);
  const selectedFrames = selection?.framesByBurstId;
  const expanded = useMemo(() => {
    return selectedFrames === undefined
      ? new Map(props.expanded)
      : new Map(
          [...selectedFrames.keys()].map((id) => {
            return [id, { height: 0 }] as const;
          }),
        );
  }, [props.expanded, selectedFrames]);
  const frames = selection?.framesByBurstId ?? props.framesByBurstId;
  const mappedRows = useMemo(() => {
    return getTimelineRowsFromDays({
      days: props.days,
      columns: layout.columns,
      fanWidth: layout.fanWidth,
      framesByBurstId: frames,
      expanded,
    });
  }, [props.days, layout, frames, expanded]);
  const focus = useTimelineFocus({
    rows: mappedRows,
    viewKey: props.viewKey ?? "timeline",
    retirement: props.focusRetirement ?? 0,
    element,
  });
  const rows = focus.rows;
  return { layout, selection, focus, rows };
}

function useStream({
  props,
  element,
}: Readonly<{ props: Readonly<Props>; element: RootRef }>): Stream {
  const { rows, layout, focus, selection } = useStreamRows({ props, element });
  const windowing = useTimelineWindow({
    rows,
    viewKey: props.viewKey ?? "timeline",
    focusedItemId: focus.focusedItemId,
    element,
    ...layout,
    pageCursors: props.pageCursors,
    recoverPage: props.recoverPage,
    restoreBurst: props.restoreBurst,
  });
  const position = useTimelinePosition({
    viewKey: props.viewKey ?? "timeline",
    hasRows: rows.length > 0,
    element,
    ...windowing,
  });
  return { rows, layout, focus, selection, windowing, position };
}

/** Measured row and restoration ownership shared by stream children. */
export type Stream = StreamRows & {
  windowing: ReturnType<typeof useTimelineWindow>;
  position: ReturnType<typeof useTimelinePosition>;
};

function useStreamPaging(props: Readonly<Props>): {
  sentinelRef: RefObject<HTMLDivElement | null>;
  startRef: RefObject<HTMLDivElement | null>;
} {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  useTimelinePagingSentinel({
    sentinelRef,
    onReachEnd: props.onReachEnd,
    hasMore: props.hasMore,
    isFetching: props.isFetching,
  });
  useTimelinePagingSentinel({
    sentinelRef: startRef,
    onReachEnd: props.onReachStart ?? (() => {}),
    hasMore: props.hasPrevious ?? false,
    isFetching: props.isFetching,
  });
  return { sentinelRef, startRef };
}

function _collapseBurst({
  props,
  stream,
  element,
  burstId,
}: BurstCollapseOptions): void {
  const { rows, focus, windowing } = stream;

  const row = rows.find((candidate) => {
    return candidate.burstId === burstId;
  });
  focus.onBlur();
  props.onCollapseBurst?.(burstId);
  if (!row) {
    return;
  }
  const offsetPx =
    Math.max(
      80,
      document.querySelector("header")?.getBoundingClientRect().bottom ?? 80,
    ) + 16;
  void windowing
    .restoreAnchor({
      capturedOn: row.day.capturedOn,
      itemId: row.items[0]?.itemId,
      offsetPx,
      pageCursor: props.pageCursors?.get(row.day.capturedOn),
    })
    .then(() => {
      [
        ...(element.current?.querySelectorAll<HTMLElement>("[data-burst-id]") ??
          []),
      ]
        .find((node) => {
          return node.dataset.burstId === burstId;
        })
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    });
}

/** The retained pages stay atomic while only measured media rows mount. */
export function DayStream({
  days,
  countLabel,
  framesByBurstId,
  onOpenBurst,
  onOpenItem,
  onReachEnd,
  hasMore,
  isFetching,
  hasPrevious,
  onReachStart,
  viewKey,
  pageCursors,
  recoverPage,
  restoreBurst,
  expanded,
  onCollapseBurst,
  focusRetirement,
}: Readonly<Props>): ReactNode {
  const props: Props = {
    days,
    countLabel,
    framesByBurstId,
    onOpenBurst,
    onOpenItem,
    onReachEnd,
    hasMore,
    isFetching,
    hasPrevious,
    onReachStart,
    viewKey,
    pageCursors,
    recoverPage,
    restoreBurst,
    expanded,
    onCollapseBurst,
    focusRetirement,
  };
  const element = useRef<HTMLDivElement>(null);
  const stream = useStream({ props: props, element: element });
  const paging = useStreamPaging(props);
  const resources = useContext(MediaLoadingContext);
  useTimelineFanRestoration({
    element,
    isSelecting: stream.selection !== undefined,
    rows: stream.rows,
    positions: stream.windowing.positions,
    onOpenBurst: props.onOpenBurst,
  });
  useTimelineExpansionSizes({
    memory: resources?.timeline,
    viewKey: props.viewKey ?? "timeline",
    rows: stream.rows,
    measurements: stream.windowing.measurements,
    framesByBurstId: props.framesByBurstId,
  });
  return (
    <StreamBody
      props={props}
      stream={stream}
      element={element}
      {...paging}
      onCollapseBurst={(id) => {
        _collapseBurst({ props, stream, element, burstId: id });
      }}
    />
  );
}
