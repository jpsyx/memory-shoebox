import { useState } from "react";
import type { MilestoneAttachmentEntry } from "../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
import type { AttachmentSubmission } from "./useMilestoneAttachment.types";
import { getMilestoneItemDeltaFromChoices } from "../milestoneAttachmentHelpers/milestoneAttachmentHelpers";
import { useMilestoneAttachmentBaseline } from "./useMilestoneAttachmentBaseline";
type Choices = {
  entries: MilestoneAttachmentEntry[];
  chosenCount: number;
  attachCount: number;
  detachCount: number;
  toggle: (itemId: string) => void;
  getSnapshot: () => AttachmentSubmission;
};
function _getChoiceViewFromEntries(
  options: Readonly<{
    entries: readonly MilestoneAttachmentEntry[];
    baseline: ReadonlyMap<string, boolean>;
    chosen: ReadonlyMap<string, boolean>;
  }>,
): Pick<Choices, "entries" | "chosenCount" | "attachCount" | "detachCount"> {
  const { entries, baseline, chosen } = options;
  const observed = new Map([
    ...entries.map((entry) => {
      return [entry.item.itemId, entry.isAttached] as const;
    }),
    ...baseline,
  ]);
  const changed = [...chosen].filter(([itemId, value]) => {
    return baseline.has(itemId) && baseline.get(itemId) !== value;
  });
  return {
    entries: entries.map((entry) => {
      return {
        ...entry,
        isAttached:
          chosen.get(entry.item.itemId) ??
          baseline.get(entry.item.itemId) ??
          entry.isAttached,
      };
    }),
    chosenCount: [...observed].filter(([itemId, value]) => {
      return chosen.get(itemId) ?? value;
    }).length,
    attachCount: changed.filter(([, value]) => {
      return value;
    }).length,
    detachCount: changed.filter(([, value]) => {
      return !value;
    }).length,
  };
}
function _getChoicesFromToggle(
  options: Readonly<{
    previous: ReadonlyMap<string, boolean>;
    baseline: ReadonlyMap<string, boolean>;
    itemId: string;
  }>,
): Map<string, boolean> {
  const updated = new Map(options.previous);
  updated.set(
    options.itemId,
    !(
      options.previous.get(options.itemId) ??
      options.baseline.get(options.itemId)
    ),
  );
  return updated;
}
/** Retains explicit intent and first-seen attachment baselines across reads. */
export function useMilestoneAttachmentChoices(
  options: Readonly<{
    entries: readonly MilestoneAttachmentEntry[];
    isLocked: boolean;
  }>,
): Choices {
  const { entries, isLocked } = options;
  const baseline = useMilestoneAttachmentBaseline(entries);
  const [chosen, setChosen] = useState(new Map<string, boolean>());
  const toggle = (itemId: string) => {
    if (isLocked || !baseline.current.has(itemId)) {
      return;
    }
    setChosen((previous) => {
      return _getChoicesFromToggle({
        previous,
        baseline: baseline.current,
        itemId,
      });
    });
  };
  const getSnapshot = () => {
    return {
      delta: getMilestoneItemDeltaFromChoices({
        baseline: baseline.current,
        chosen,
      }),
      baseline: new Map(baseline.current),
      chosen: new Map(chosen),
    };
  };
  return {
    ..._getChoiceViewFromEntries({
      entries,
      baseline: baseline.current,
      chosen,
    }),
    toggle,
    getSnapshot,
  };
}
