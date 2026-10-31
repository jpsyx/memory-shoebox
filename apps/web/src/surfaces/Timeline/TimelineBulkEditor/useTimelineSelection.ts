import { useLayoutEffect, useRef, useState } from "react";
import type { TimelineDay } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import {
  cancelTimelineSelectionReads,
  makeEmptyTimelineSelection,
  makeTimelineSelectionActions,
} from "./timelineSelectionActions";
import type {
  TimelineSelectionContext,
  TimelineSelectionState,
} from "./useTimelineSelection.types";

/** Explicit filtered ticks, with ordered additive ranges and stale-read guards. */
export function useTimelineSelection(
  days: readonly TimelineDay[],
  filterSelection?: Readonly<TimelineSelection>,
): TimelineSelectionState {
  const [snapshot, setSnapshot] = useState(makeEmptyTimelineSelection);
  const reference = useRef<TimelineSelectionContext | undefined>(undefined);
  reference.current ??= {
    days,
    filterSelection,
    snapshot,
    epoch: 0,
    rangeEpoch: 0,
    rangeQueued: 0,
    queued: 0,
    queue: Promise.resolve(),
    publish: (updated) => {
      reference.current!.snapshot = updated;
      setSnapshot(updated);
    },
  };
  const context = reference.current;
  context.days = days;
  context.filterSelection = filterSelection;
  const filterKey = JSON.stringify(filterSelection);
  useLayoutEffect(() => {
    cancelTimelineSelectionReads(context);
    context.publish({
      ...makeEmptyTimelineSelection(),
      isSelecting: context.snapshot.isSelecting,
    });
    return () => {
      return cancelTimelineSelectionReads(context);
    };
  }, [context, filterKey]);
  return { ...snapshot, ...makeTimelineSelectionActions(context) };
}
