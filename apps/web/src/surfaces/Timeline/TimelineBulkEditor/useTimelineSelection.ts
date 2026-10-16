import { useRef, useState } from "react";
import { BULK_EDIT_MAX_ITEMS, type TimelineDay } from "@memory-shoebox/shared";
import type { TimelineSelection } from "@/api/timelineHelpers/timelineSelectionHelpers/timelineSelectionHelpers";
import { readTimelineSelection } from "./timelineSelectionReadHelpers";
import type {
  TimelineSelectionActions,
  TimelineSelectionContext,
  TimelineSelectionSnapshot,
  TimelineSelectionState,
} from "./useTimelineSelection.types";

function _makeEmptySnapshot(): TimelineSelectionSnapshot {
  return {
    isSelecting: false,
    selectedItemIds: new Set(),
    framesByBurstId: new Map(),
    isLoading: false,
  };
}

function _getSnapshotFromToggle(
  snapshot: Readonly<TimelineSelectionSnapshot>,
  itemId: string,
): TimelineSelectionSnapshot {
  const selectedItemIds = new Set(snapshot.selectedItemIds);
  if (selectedItemIds.has(itemId)) {
    selectedItemIds.delete(itemId);
  } else if (selectedItemIds.size < BULK_EDIT_MAX_ITEMS) {
    selectedItemIds.add(itemId);
  } else {
    return {
      ...snapshot,
      problem: `Choose up to ${BULK_EDIT_MAX_ITEMS} photos and videos at once. Untick one before choosing another.`,
    };
  }
  return { ...snapshot, selectedItemIds, problem: undefined };
}

function _makeActions(
  context: Readonly<TimelineSelectionContext>,
): TimelineSelectionActions {
  return {
    onToggle: (itemId) => {
      if (!context.pending.current) {
        context.setSnapshot((previousSnapshot) => {
          return _getSnapshotFromToggle(previousSnapshot, itemId);
        });
      }
    },
    clear: () => {
      context.setSnapshot((previousSnapshot) => {
        return {
          ...previousSnapshot,
          selectedItemIds: new Set(),
          problem: undefined,
        };
      });
    },
    start: () => {
      context.setSnapshot((previousSnapshot) => {
        return { ...previousSnapshot, isSelecting: true };
      });
    },
    finish: () => {
      context.setSnapshot(_makeEmptySnapshot());
    },
    tickLoaded: () => {
      void readTimelineSelection({ context });
    },
    onOpenBurst: (burstId) => {
      void readTimelineSelection({ context, burstId });
    },
  };
}

/**
 * Selection contains explicit matching item IDs, never an implicit whole
 * archive.
 */
export function useTimelineSelection(
  days: readonly TimelineDay[],
  filterSelection?: Readonly<TimelineSelection>,
): TimelineSelectionState {
  const [snapshot, setSnapshot] =
    useState<TimelineSelectionSnapshot>(_makeEmptySnapshot);
  const pending = useRef(false);
  return {
    ...snapshot,
    ..._makeActions({ days, filterSelection, pending, setSnapshot }),
  };
}
