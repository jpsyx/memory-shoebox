import type { MilestoneSelection } from "@/surfaces/Milestones/useMilestoneForm/milestoneFormHelpers";
import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";

/** Keeps every explicit ID and seeds dates from the loaded prints and same-day stacks. */
export function getMilestoneSelectionFromTimeline({
  itemIds,
  days,
  framesByBurstId,
}: Readonly<{
  itemIds: readonly string[];
  days: readonly TimelineDay[];
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
}>): MilestoneSelection {
  const captureDays = new Map<string, string>();
  for (const day of days) {
    for (const item of day.items) {
      captureDays.set(item.itemId, item.capturedOn);
      const frames = item.burst
        ? (framesByBurstId.get(item.burst.burstId) ?? [])
        : [];
      for (const frame of frames) {
        captureDays.set(frame.itemId, item.capturedOn);
      }
    }
  }
  return itemIds.map((itemId) => {
    return { itemId, capturedOn: captureDays.get(itemId) };
  });
}
