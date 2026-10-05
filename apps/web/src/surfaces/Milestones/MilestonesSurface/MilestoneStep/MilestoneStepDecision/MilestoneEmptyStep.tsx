import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MilestoneEmpty } from "../../../MilestoneEmpty";
import type { Props as OwnerProps } from "../MilestoneStep";
type Props = {
  detail: MilestoneDetail;
  onNavigate: OwnerProps["onNavigate"];
  onCancel: () => void;
};
/** Presents milestone empty step. */
export function MilestoneEmptyStep({
  detail,
  onNavigate,
  onCancel,
}: Readonly<Props>): ReactNode {
  return (
    <MilestoneEmpty
      detail={detail}
      onAttach={() => {
        return onNavigate({
          milestone: detail.milestone.milestoneId,
          mode: "attach",
        });
      }}
      onCancel={onCancel}
    />
  );
}
