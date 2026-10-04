import { useEffect, useRef } from "react";
import type { MilestoneAttachmentEntry } from "../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
/** Records each attachment baseline once while ordinary reads may change. */
export function useMilestoneAttachmentBaseline(
  entries: readonly MilestoneAttachmentEntry[],
): { current: Map<string, boolean> } {
  const baseline = useRef(new Map<string, boolean>());
  useEffect(
    function observeAttachmentBaselines() {
      entries.forEach(({ item, isAttached }) => {
        if (!baseline.current.has(item.itemId)) {
          baseline.current.set(item.itemId, isAttached);
        }
      });
    },
    [entries],
  );
  return baseline;
}
