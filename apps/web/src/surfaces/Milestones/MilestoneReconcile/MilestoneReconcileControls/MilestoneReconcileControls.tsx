import { Prose } from "@/system/typography/Prose";
import type { ReactNode } from "react";
import type { useMilestoneReconcile } from "../../useMilestoneReconcile/useMilestoneReconcile";
import { MilestoneReconcileLinks } from "./MilestoneReconcileLinks/MilestoneReconcileLinks";
import { MilestoneReconcilePaging } from "./MilestoneReconcilePaging/MilestoneReconcilePaging";
/** Reconciliation state and onward navigation callbacks. */
export type Props = {
  controller: ReturnType<typeof useMilestoneReconcile>;
  onDone: () => void;
  onOtherMilestone: (milestoneId: string) => void;
};
/** Presents confirmed counts, remaining batch continuation and named fixes. */
export function MilestoneReconcileControls({
  controller,
  onDone,
  onOtherMilestone,
}: Readonly<Props>): ReactNode {
  const options = { controller, onDone, onOtherMilestone };

  return (
    <>
      {controller.result !== undefined ? (
        <Prose onPanel role="status">
          {controller.result}
        </Prose>
      ) : null}
      {controller.detail.mismatchCount === 0 &&
      controller.error !== undefined ? (
        <Prose onPanel role="alert">
          {controller.error}
        </Prose>
      ) : null}
      <MilestoneReconcilePaging controller={controller} />
      <MilestoneReconcileLinks {...options} />
    </>
  );
}
