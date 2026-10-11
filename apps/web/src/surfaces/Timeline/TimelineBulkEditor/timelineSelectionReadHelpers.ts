import { getBurstFramesForSelection } from "@/api/bulkItems/getBurstFramesForSelection";
import {
  BULK_EDIT_MAX_ITEMS,
  type BurstFrameRef,
} from "@memory-shoebox/shared";
import type {
  TimelineSelectionContext,
  TimelineSelectionSnapshot,
} from "./useTimelineSelection.types";

type LoadedSelection = {
  itemIds: Set<string>;
  frames: Map<string, BurstFrameRef[]>;
};
type ReadOptions = { context: TimelineSelectionContext; burstId?: string };

async function _getLoadedSelection({
  context,
  burstId,
}: Readonly<ReadOptions>): Promise<LoadedSelection> {
  const frames = new Map<string, BurstFrameRef[]>();
  const itemIds = new Set<string>();
  if (burstId !== undefined) {
    frames.set(
      burstId,
      await getBurstFramesForSelection(burstId, context.filterSelection),
    );
    return { itemIds, frames };
  }
  for (const item of context.days.flatMap((day) => {
    return day.items;
  })) {
    if (item.burst === null) {
      itemIds.add(item.itemId);
    } else {
      const burstFrames = await getBurstFramesForSelection(
        item.burst.burstId,
        context.filterSelection,
      );
      frames.set(item.burst.burstId, burstFrames);
      burstFrames.forEach((frame) => {
        itemIds.add(frame.itemId);
      });
    }
    if (itemIds.size > BULK_EDIT_MAX_ITEMS) {
      break;
    }
  }
  return { itemIds, frames };
}

function _getSnapshotFromLoadedSelection(
  previousSnapshot: Readonly<TimelineSelectionSnapshot>,
  loaded: Readonly<LoadedSelection>,
  isSingleBurst: boolean,
): TimelineSelectionSnapshot {
  if (loaded.itemIds.size > BULK_EDIT_MAX_ITEMS) {
    return {
      ...previousSnapshot,
      problem: `Choose up to ${BULK_EDIT_MAX_ITEMS} photos and videos at once. Use Find to narrow the timeline.`,
    };
  }
  return {
    ...previousSnapshot,
    selectedItemIds: isSingleBurst
      ? previousSnapshot.selectedItemIds
      : loaded.itemIds,
    framesByBurstId: new Map([
      ...previousSnapshot.framesByBurstId,
      ...loaded.frames,
    ]),
  };
}

/** Reads matching frames without publishing partial results or losing existing ticks on failure. */
export async function readTimelineSelection(
  options: Readonly<ReadOptions>,
): Promise<void> {
  const { context } = options;
  if (context.pending.current) {
    return;
  }
  context.pending.current = true;
  context.setSnapshot((previousSnapshot) => {
    return { ...previousSnapshot, isLoading: true, problem: undefined };
  });
  try {
    const loaded = await _getLoadedSelection(options);
    context.setSnapshot((previousSnapshot) => {
      return _getSnapshotFromLoadedSelection(
        previousSnapshot,
        loaded,
        options.burstId !== undefined,
      );
    });
  } catch {
    context.setSnapshot((previousSnapshot) => {
      return {
        ...previousSnapshot,
        problem:
          "Some stacks could not be loaded. Your ticks are unchanged. Try again.",
      };
    });
  } finally {
    context.pending.current = false;
    context.setSnapshot((previousSnapshot) => {
      return { ...previousSnapshot, isLoading: false };
    });
  }
}
