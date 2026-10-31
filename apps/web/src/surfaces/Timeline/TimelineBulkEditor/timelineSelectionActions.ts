import { BULK_EDIT_MAX_ITEMS } from "@memory-shoebox/shared";
import { readTimelineSelection } from "./timelineSelectionReadHelpers";
import type {
  SelectionTarget,
  TimelineSelectionActions,
  TimelineSelectionContext,
  TimelineSelectionSnapshot,
} from "./useTimelineSelection.types";

/** A fresh tick session contains no cached membership or range anchor. */
export function makeEmptyTimelineSelection(): TimelineSelectionSnapshot {
  return {
    isSelecting: false,
    openedBurstIds: new Set(),
    selectedItemIds: new Set(),
    framesByBurstId: new Map(),
    isLoading: false,
  };
}

/** End the Shift gesture without cancelling independent burst commands. */
export function cancelTimelineRangeReads(
  context: TimelineSelectionContext,
): void {
  context.rangeEpoch += 1;
  context.anchor = undefined;
  context.queued -= context.rangeQueued;
  context.rangeQueued = 0;
  context.cancelRangeRead?.();
  context.cancelRangeRead = undefined;
}

/** Retire pending reads without waiting for network settlement. */
export function cancelTimelineSelectionReads(
  context: TimelineSelectionContext,
): void {
  cancelTimelineRangeReads(context);
  context.epoch += 1;
  context.queue = Promise.resolve();
  context.queued = 0;
}

function _toggle(context: TimelineSelectionContext, itemId: string): void {
  cancelTimelineRangeReads(context);
  const selectedItemIds = new Set(context.snapshot.selectedItemIds);
  if (selectedItemIds.has(itemId)) {
    selectedItemIds.delete(itemId);
  } else {
    selectedItemIds.add(itemId);
  }
  context.publish(
    selectedItemIds.size > BULK_EDIT_MAX_ITEMS
      ? {
          ...context.snapshot,
          isLoading: context.queued > 0,
          problem: `Choose up to ${BULK_EDIT_MAX_ITEMS} photos and videos at once. Untick one before choosing another.`,
        }
      : {
          ...context.snapshot,
          selectedItemIds,
          isLoading: context.queued > 0,
          problem: undefined,
        },
  );
}

function _select(
  context: TimelineSelectionContext,
  target: SelectionTarget,
  shiftKey: boolean,
): void {
  if (!shiftKey) {
    if (target.kind === "item") {
      _toggle(context, target.itemId);
    } else {
      cancelTimelineRangeReads(context);
    }
    return;
  }
  context.anchor ??= target;
  readTimelineSelection({
    context,
    range: { start: context.anchor, end: target },
    mode: "add",
  });
}

/** Shared commands merge against the latest ticks, not the initiating render. */
export function makeTimelineSelectionActions(
  context: TimelineSelectionContext,
): TimelineSelectionActions {
  return {
    onToggle: (itemId) => {
      return _toggle(context, itemId);
    },
    onSelect: (target, modifiers) => {
      return _select(context, target, modifiers.shiftKey);
    },
    onSelectBurst: (burstId) => {
      return readTimelineSelection({ context, burstId, mode: "add" });
    },
    onDeselectBurst: (burstId) => {
      return readTimelineSelection({ context, burstId, mode: "remove" });
    },
    onOpenBurst: (burstId) => {
      context.publish({
        ...context.snapshot,
        openedBurstIds: new Set([...context.snapshot.openedBurstIds, burstId]),
      });
      readTimelineSelection({ context, burstId, mode: "open" });
    },
    onCollapseBurst: (burstId) => {
      const openedBurstIds = new Set(context.snapshot.openedBurstIds);
      openedBurstIds.delete(burstId);
      context.publish({ ...context.snapshot, openedBurstIds });
    },
    tickLoaded: () => {
      return readTimelineSelection({ context, mode: "loaded" });
    },
    start: () => {
      return context.publish({ ...context.snapshot, isSelecting: true });
    },
    clear: () => {
      cancelTimelineSelectionReads(context);
      context.publish({
        ...context.snapshot,
        selectedItemIds: new Set(),
        isLoading: false,
        problem: undefined,
      });
    },
    finish: () => {
      cancelTimelineSelectionReads(context);
      context.publish(makeEmptyTimelineSelection());
    },
  };
}
