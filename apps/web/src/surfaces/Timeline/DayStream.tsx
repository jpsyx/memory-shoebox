import {
  useTimelineFanRestoration,
  useTimelineExpansionSizes,
} from "./windowing/useTimelineFans";
import { useTimelinePagingSentinel } from "./windowing/useTimelinePagingSentinel";
import { Button } from "@mantine/core";
import { useTimelinePosition } from "./windowing/useTimelinePosition";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { useTimelineLayout } from "./windowing/useTimelineLayout";
import { useTimelineFocus } from "./windowing/useTimelineFocus";
import {
  useRef,
  useMemo,
  useContext,
  type ReactNode,
  type RefObject,
} from "react";
import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";
import { DaySpine } from "@/system/Pile/DaySpine";
import { PileSelectionContext } from "@/system/Pile/PileSelection/PileSelection";
import { getTimelineRowsFromDays } from "./windowing/getTimelineRowsFromDays";
import { useTimelineWindow } from "./windowing/useTimelineWindow";
import { TimelineDayRows } from "./windowing/TimelineRows";
import type {
  TimelineAnchor,
  TimelineExpansion,
} from "./windowing/timelineWindow.types";
import classes from "@/system/system.module.css";

type Props = {
  days: readonly TimelineDay[];
  countLabel: string | undefined;
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  onOpenBurst: (burstId: string) => void;
  onOpenItem: (itemId: string) => void;
  /** Asks for the next page. A no-op once there is none. */
  onReachEnd: () => void;
  hasMore: boolean;
  isFetching?: boolean;
  hasPrevious?: boolean;
  onReachStart?: () => void;
  viewKey?: string;
  pageCursors?: ReadonlyMap<string, string | null>;
  recoverPage?: (anchor: TimelineAnchor) => Promise<void>;
  expanded?: ReadonlyMap<string, TimelineExpansion>;
  onCollapseBurst?: (burstId: string) => void;
  focusRetirement?: number;
};

type RootRef = RefObject<HTMLDivElement | null>;

function useStreamRows(props: Readonly<Props>, element: RootRef) {
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
  const focus = useTimelineFocus(
    mappedRows,
    props.viewKey ?? "timeline",
    props.focusRetirement ?? 0,
    element,
  );
  const rows = focus.rows;
  return { layout, selection, focus, rows };
}

function useStream(props: Readonly<Props>, element: RootRef) {
  const { rows, layout, focus, selection } = useStreamRows(props, element);
  const windowing = useTimelineWindow({
    rows,
    viewKey: props.viewKey ?? "timeline",
    focusedItemId: focus.focusedItemId,
    element,
    ...layout,
    pageCursors: props.pageCursors,
    recoverPage: props.recoverPage,
  });
  const position = useTimelinePosition({
    viewKey: props.viewKey ?? "timeline",
    hasRows: rows.length > 0,
    element,
    ...windowing,
  });
  return { rows, layout, focus, selection, windowing, position };
}
type Stream = ReturnType<typeof useStream>;

function useStreamPaging(props: Readonly<Props>) {
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

function _collapseBurst(
  props: Readonly<Props>,
  stream: Stream,
  element: RootRef,
  burstId: string,
): void {
  const { rows, focus, windowing } = stream;

  const row = rows.find((candidate) => {
    return candidate.burstId === burstId;
  });
  focus.onBlur();
  props.onCollapseBurst?.(burstId);
  if (!row) return;
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
      pageCursor: props.pageCursors?.get(row.day.capturedOn) ?? null,
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
export function DayStream(props: Readonly<Props>): ReactNode {
  const element = useRef<HTMLDivElement>(null);
  const stream = useStream(props, element);
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
        _collapseBurst(props, stream, element, id);
      }}
    />
  );
}

type StreamProps = {
  props: Readonly<Props>;
  stream: Stream;
  onCollapseBurst: (id: string) => void;
};
function StreamBody({
  props,
  stream,
  element,
  startRef,
  sentinelRef,
  onCollapseBurst,
}: StreamProps & {
  element: RootRef;
  startRef: RootRef;
  sentinelRef: RootRef;
}): ReactNode {
  const { focus, position } = stream;
  return (
    <div
      ref={element}
      className={classes.timelineWindow}
      onFocusCapture={(event) => {
        focus.onFocus(
          (event.target as HTMLElement).closest<HTMLElement>("[data-item-id]")
            ?.dataset.itemId,
        );
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focus.onBlur();
      }}
    >
      {position.hasRestoreError && (
        <div>
          <p>Could not return to your place.</p>
          <Button onClick={position.retry}>
            Retry returning to your place
          </Button>
        </div>
      )}
      <div
        ref={startRef}
        className={classes.timelineStart}
        aria-hidden="true"
      />
      <StreamDays
        props={props}
        stream={stream}
        onCollapseBurst={onCollapseBurst}
      />
      <div ref={sentinelRef} aria-hidden="true" />
    </div>
  );
}

function StreamDays({
  props,
  stream,
  onCollapseBurst,
}: StreamProps): ReactNode {
  const days = new Map(
    stream.rows.map((row) => {
      return [row.day.capturedOn, row.day];
    }),
  );
  const visible = new Set(
    stream.windowing.positions.map((position) => {
      return position.index;
    }),
  );
  return [...days.values()].map((day) => {
    return (
      <StreamDay
        key={day.capturedOn}
        day={day}
        visible={visible}
        props={props}
        stream={stream}
        onCollapseBurst={onCollapseBurst}
      />
    );
  });
}

function StreamDay({
  props,
  stream,
  day,
  visible,
  onCollapseBurst,
}: StreamProps & {
  day: TimelineDay;
  visible: ReadonlySet<number>;
}): ReactNode {
  const { rows, layout, windowing } = stream;
  const indexes = rows.flatMap((row, index) => {
    return row.day.capturedOn === day.capturedOn ? [index] : [];
  });
  const first = windowing.measurements[indexes[0] ?? 0];
  const last = windowing.measurements[indexes.at(-1) ?? 0];
  const height = first && last ? last.end - first.start : 0;
  return (
    <section
      id={`day-${day.capturedOn}`}
      className={`${classes.day} ${classes.timelineDay}`}
      style={{ height }}
    >
      {!layout.isMobile && (
        <div className={classes.timelineDesktopSpine}>
          <DaySpine day={day} countLabel={props.countLabel} />
        </div>
      )}
      <div data-timeline-pile className={classes.timelinePile}>
        <TimelineDayRows
          isMobile={layout.isMobile}
          rows={rows}
          indexes={indexes}
          measurements={windowing.measurements}
          visible={visible}
          measure={windowing.virtualizer.measureElement}
          countLabel={props.countLabel}
          onOpenBurst={props.onOpenBurst}
          onOpenItem={props.onOpenItem}
          onCollapseBurst={onCollapseBurst}
        />
      </div>
    </section>
  );
}
