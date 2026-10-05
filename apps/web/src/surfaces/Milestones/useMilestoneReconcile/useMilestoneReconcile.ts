import { useMilestoneReconcileTargets } from "./useMilestoneReconcileTargets";
import { getMilestoneMovesFromTargets } from "../milestoneReconcileHelpers/milestoneReconcileHelpers";
import { useMilestoneReconcileReads } from "./useMilestoneReconcileReads";
import { useMilestoneReconcileActions } from "./useMilestoneReconcileActions";
import type {
  ReconcileOptions,
  ReconcileController,
  ReconcileSubmission,
} from "./useMilestoneReconcile.types";
function _submitReconcileAction({
  action,
  reads,
  actions,
  targets,
  fieldErrors,
}: Readonly<{
  action: ReconcileSubmission["action"];
  reads: ReturnType<typeof useMilestoneReconcileReads>;
  actions: ReturnType<typeof useMilestoneReconcileActions>;
  targets: Readonly<Record<string, string | undefined>>;
  fieldErrors: Readonly<Record<string, string>>;
}>): void {
  const milestone = reads.detail.milestone;
  const itemIds = reads.strays.map(({ itemId }) => {
    return itemId;
  });
  const body =
    action === "move"
      ? getMilestoneMovesFromTargets({ milestone, itemIds, targets })
      : action === "acknowledge"
        ? { mode: "acknowledge" as const, itemIds }
        : reads.wideningSpan;
  if (
    body === undefined ||
    (action !== "widen" && itemIds.length === 0) ||
    (action === "move" &&
      itemIds.some((id) => {
        return fieldErrors[id] !== undefined;
      }))
  ) {
    return;
  }
  actions.submit({ action, body, itemIds, milestone });
}
/** Retains item-keyed explicit dates across paging and authority refreshes. */
export function useMilestoneReconcile(
  options: Readonly<ReconcileOptions>,
): ReconcileController {
  const reads = useMilestoneReconcileReads(options);
  const actions = useMilestoneReconcileActions(options, reads);
  const { targets, fieldErrors, changeTarget } = useMilestoneReconcileTargets({
    reads,
    actions,
  });
  const submit = (action: ReconcileSubmission["action"]) => {
    _submitReconcileAction({ action, reads, actions, targets, fieldErrors });
  };
  return {
    ...reads,
    ...actions,
    targets,
    fieldErrors,
    changeTarget,
    move: () => {
      return submit("move");
    },
    acknowledge: () => {
      return submit("acknowledge");
    },
    widen: () => {
      return submit("widen");
    },
    isPending:
      actions.isPending ||
      reads.isReading ||
      !reads.hasUsableReads ||
      options.hasUsableAuthority === false,
  };
}
