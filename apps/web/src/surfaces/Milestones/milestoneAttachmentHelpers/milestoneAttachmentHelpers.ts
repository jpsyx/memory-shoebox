import type {
  ItemSummary,
  SetMilestoneItemsRequest,
} from "@memory-shoebox/shared";
/** One explicit selectable identity and its observed attachment state. */
export type MilestoneAttachmentEntry = {
  item: ItemSummary;
  isAttached: boolean;
};
/** Changes only explicitly chosen identities with a known baseline. */
export function getMilestoneItemDeltaFromChoices(
  options: Readonly<{
    baseline: ReadonlyMap<string, boolean>;
    chosen: ReadonlyMap<string, boolean>;
  }>,
): SetMilestoneItemsRequest {
  const changes = [...options.chosen].filter(([itemId, value]) => {
    return (
      options.baseline.has(itemId) && options.baseline.get(itemId) !== value
    );
  });
  const attach = changes
    .filter(([, value]) => {
      return value;
    })
    .map(([itemId]) => {
      return itemId;
    });
  const detach = changes
    .filter(([, value]) => {
      return !value;
    })
    .map(([itemId]) => {
      return itemId;
    });
  if (attach.length > 500 || detach.length > 500) {
    throw new Error(
      "Save at most 500 attachments and 500 detachments at a time. Your choices are kept.",
    );
  }
  return { attach, detach };
}
/**
 * Combines branch pages without merging distinct representatives of a burst.
 */
export function getMilestoneEntriesFromBranches(
  entries: readonly MilestoneAttachmentEntry[],
): MilestoneAttachmentEntry[] {
  return [
    ...new Map(
      entries.map((entry) => {
        return [entry.item.itemId, entry];
      }),
    ).values(),
  ].sort((left, right) => {
    return (
      right.item.capturedOn.localeCompare(left.item.capturedOn) ||
      right.item.capturedAt.localeCompare(left.item.capturedAt) ||
      left.item.itemId.localeCompare(right.item.itemId)
    );
  });
}
