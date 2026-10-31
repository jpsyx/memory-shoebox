import { getBurstFramesForSelection } from "@/api/bulkItems/getBurstFramesForSelection";
import {
  BULK_EDIT_MAX_ITEMS,
  type BurstFrameRef,
} from "@memory-shoebox/shared";
import {
  getItemIdsFromTimelineRange,
  getItemsFromTimelineRange,
} from "./timelineRangeSelection/timelineRangeSelection";
import type {
  SelectionTarget,
  TimelineSelectionContext,
} from "./useTimelineSelection.types";

type ReadOptions = {
  context: TimelineSelectionContext;
  burstId?: string;
  range?: { start: SelectionTarget; end: SelectionTarget };
  mode: "add" | "remove" | "open" | "loaded";
};

async function _readMembership(
  options: Readonly<ReadOptions>,
): Promise<Map<string, BurstFrameRef[]>> {
  const { context, burstId, range } = options;
  const frames = new Map(context.snapshot.framesByBurstId);
  const items = range
    ? getItemsFromTimelineRange({
        days: context.days,
        framesByBurstId: frames,
        ...range,
      })
    : context.days.flatMap((day) => {
        return day.items;
      });
  const burstIds = burstId
    ? [burstId]
    : items.flatMap((item) => {
        return item.burst ? [item.burst.burstId] : [];
      });
  await [...new Set(burstIds)].reduce(async (previous, id) => {
    await previous;
    if (!frames.has(id)) {
      frames.set(
        id,
        await getBurstFramesForSelection(id, context.filterSelection),
      );
    }
  }, Promise.resolve());
  return frames;
}

function _publishRead(
  options: Readonly<ReadOptions>,
  frames: Map<string, BurstFrameRef[]>,
): void {
  const { context, burstId, range, mode } = options;
  const ids = range
    ? getItemIdsFromTimelineRange({
        days: context.days,
        framesByBurstId: frames,
        ...range,
      })
    : burstId
      ? (frames.get(burstId) ?? []).map((frame) => {
          return frame.itemId;
        })
      : context.days.flatMap((day) => {
          return day.items.flatMap((item) => {
            return item.burst
              ? (frames.get(item.burst.burstId) ?? []).map((frame) => {
                  return frame.itemId;
                })
              : [item.itemId];
          });
        });
  const selectedItemIds = new Set(context.snapshot.selectedItemIds);
  ids.forEach((id) => {
    if (mode === "remove") {
      selectedItemIds.delete(id);
    } else if (mode !== "open") {
      selectedItemIds.add(id);
    }
  });
  if (selectedItemIds.size > BULK_EDIT_MAX_ITEMS) {
    context.publish({
      ...context.snapshot,
      problem: `Choose up to ${BULK_EDIT_MAX_ITEMS} photos and videos at once. Use Find to narrow the timeline.`,
    });
    return;
  }
  context.publish({
    ...context.snapshot,
    selectedItemIds,
    framesByBurstId: frames,
    problem: undefined,
  });
}

/** Let an abandoned range release the queue while its network read settles. */
async function _readCancellableMembership(
  options: Readonly<ReadOptions>,
): Promise<Map<string, BurstFrameRef[]> | undefined> {
  if (!options.range) {
    return _readMembership(options);
  }
  const { context } = options;
  let cancel!: () => void;
  const cancellation = new Promise<undefined>((resolve) => {
    cancel = () => {
      resolve(undefined);
    };
  });
  context.cancelRangeRead = cancel;
  try {
    return await Promise.race([_readMembership(options), cancellation]);
  } finally {
    if (context.cancelRangeRead === cancel) {
      context.cancelRangeRead = undefined;
    }
  }
}

async function _runRead(
  options: Readonly<ReadOptions>,
  isCurrent: () => boolean,
): Promise<void> {
  const { context } = options;
  if (!isCurrent()) {
    return;
  }
  try {
    const frames = await _readCancellableMembership(options);
    if (isCurrent() && frames) {
      _publishRead(options, frames);
    }
  } catch {
    if (isCurrent()) {
      context.publish({
        ...context.snapshot,
        problem:
          "Some stacks could not be loaded. Your ticks are unchanged. Try again.",
      });
    }
  } finally {
    if (isCurrent()) {
      context.queued -= 1;
      if (options.range) {
        context.rangeQueued -= 1;
      }
      context.publish({ ...context.snapshot, isLoading: context.queued > 0 });
    }
  }
}

/** Serialize commands while retiring range gestures independently of bursts. */
export function readTimelineSelection(options: Readonly<ReadOptions>): void {
  const { context } = options;
  const epoch = context.epoch;
  const rangeEpoch = context.rangeEpoch;
  context.queued += 1;
  if (options.range) {
    context.rangeQueued += 1;
  }
  context.publish({ ...context.snapshot, isLoading: true, problem: undefined });
  context.queue = context.queue.then(() => {
    return _runRead(options, () => {
      return (
        context.epoch === epoch &&
        (!options.range || context.rangeEpoch === rangeEpoch)
      );
    });
  });
}
