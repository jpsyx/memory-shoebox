import type { ReactNode } from "react";
import { MilestoneReconcile } from "../../../MilestoneReconcile/MilestoneReconcile";
import type { Props as OwnerProps } from "../MilestoneStep";
type Props = { options: OwnerProps; onCancel: () => void };
/** Presents milestone reconcile step. */
export function MilestoneReconcileStep({
  options,
  onCancel,
}: Readonly<
  Omit<Props, "options"> & { options: Readonly<OwnerProps> }
>): ReactNode {
  return (
    <MilestoneReconcile
      detail={options.detail}
      viewer={options.viewer}
      hasUsableAuthority={options.hasUsableAuthority}
      onDone={onCancel}
      onOtherMilestone={(milestoneId) => {
        return options.onNavigate({ milestone: milestoneId, mode: "fix" });
      }}
    />
  );
}
