import type {
  BurstFrameRef,
  ItemSummary,
  TimelineDay,
} from "@memory-shoebox/shared";
import type { SelectionTarget } from "../useTimelineSelection.types";

type RangeOptions = {
  days: readonly TimelineDay[];
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
  start: SelectionTarget;
  end: SelectionTarget;
};

function _containsTarget(
  item: ItemSummary,
  target: SelectionTarget,
  frames: RangeOptions["framesByBurstId"],
): boolean {
  if (target.kind === "burst") {
    return item.burst?.burstId === target.burstId;
  }
  return (
    item.itemId === target.itemId ||
    (item.burst !== null &&
      frames.get(item.burst.burstId)?.some((frame) => {
        return frame.itemId === target.itemId;
      }) === true)
  );
}

/** Logical blocks between endpoints, independent of mounted timeline rows. */
export function getItemsFromTimelineRange(
  options: Readonly<RangeOptions>,
): ItemSummary[] {
  const items = options.days.flatMap((day) => {
    return day.items;
  });
  const start = items.findIndex((item) => {
    return _containsTarget(item, options.start, options.framesByBurstId);
  });
  const end = items.findIndex((item) => {
    return _containsTarget(item, options.end, options.framesByBurstId);
  });
  if (start < 0 || end < 0) {
    throw new Error("The selected range is no longer in this timeline.");
  }
  return items.slice(Math.min(start, end), Math.max(start, end) + 1);
}

/** Flatten complete burst membership and retain exact individual endpoints. */
export function getItemIdsFromTimelineRange(
  options: Readonly<RangeOptions>,
): string[] {
  const items = getItemsFromTimelineRange(options);
  const entries = items.flatMap<{
    itemId: string;
    burstId: string | undefined;
  }>((item) => {
    return item.burst === null
      ? [{ itemId: item.itemId, burstId: undefined }]
      : (options.framesByBurstId.get(item.burst.burstId) ?? []).map((frame) => {
          return { itemId: frame.itemId, burstId: item.burst!.burstId };
        });
  });
  const bounds = (target: SelectionTarget) => {
    return entries.flatMap((entry, index) => {
      return (
        target.kind === "item"
          ? entry.itemId === target.itemId
          : entry.burstId === target.burstId
      )
        ? [index]
        : [];
    });
  };
  const indices = [...bounds(options.start), ...bounds(options.end)];
  if (indices.length === 0) {
    return [];
  }
  return entries
    .slice(Math.min(...indices), Math.max(...indices) + 1)
    .map((entry) => {
      return entry.itemId;
    });
}
