import { useState } from "react";
import type {
  ReconcileReads,
  ReconcileActions,
  ReconcileController,
} from "./useMilestoneReconcile.types";
/** Preserves span choices while supplying a one-day occasion's sole target. */
export function useMilestoneReconcileTargets({
  reads,
  actions,
}: Readonly<{ reads: ReconcileReads; actions: ReconcileActions }>): Pick<
  ReconcileController,
  "targets" | "fieldErrors" | "changeTarget"
> {
  const [chosen, setChosen] = useState<Record<string, string | undefined>>({});
  const milestone = reads.detail.milestone;
  const targets =
    milestone.startsOn === milestone.endsOn
      ? Object.fromEntries(
          reads.strays.map(({ itemId }) => {
            return [itemId, milestone.startsOn];
          }),
        )
      : chosen;
  const fieldErrors = Object.fromEntries(
    Object.entries(actions.fieldErrors).filter(([id]) => {
      return actions.failedTargets[id] === targets[id];
    }),
  );
  const changeTarget = ({
    itemId,
    targetOn,
  }: {
    itemId: string;
    targetOn: string;
  }) => {
    if (actions.isPending) {
      return;
    }
    setChosen((previous) => {
      return { ...previous, [itemId]: targetOn };
    });
    actions.clearFieldError(itemId);
  };
  return { targets, fieldErrors, changeTarget };
}
