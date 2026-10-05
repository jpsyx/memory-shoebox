import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MilestoneDeleteDialog } from "../../../MilestoneDeleteDialog/MilestoneDeleteDialog";
import type { MilestoneSearch } from "../../../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import type { Props as OwnerProps } from "../MilestoneStep";
import { MilestoneAttachmentStep } from "./MilestoneAttachmentStep";
import { MilestoneEditStep } from "./MilestoneEditStep";
import { MilestoneEmptyStep } from "./MilestoneEmptyStep";
import { MilestoneReadOnly } from "./MilestoneReadOnly";
import { MilestoneReconcileStep } from "./MilestoneReconcileStep";
import { MilestoneSavedStep } from "./MilestoneSavedStep";
type Props = { options: OwnerProps; onCancel: () => void };
function _isMilestoneReadOnly({
  detail,
  mode,
}: Readonly<{
  detail: MilestoneDetail;
  mode: MilestoneSearch["mode"];
}>): boolean {
  return (
    ((mode === "edit" ||
      mode === "created" ||
      mode === "attach" ||
      mode === "fix") &&
      !detail.canEdit) ||
    (mode === "delete" && !detail.canDelete)
  );
}
/** Presents the selected occasion workflow. */
export function MilestoneStepDecision({
  options,
  onCancel,
}: Readonly<
  Omit<Props, "options"> & { options: Readonly<OwnerProps> }
>): ReactNode {
  const { detail, mode, memberId, onNavigate, onDeleted } = options;
  if (mode === "edit") {
    return <MilestoneEditStep options={options} onCancel={onCancel} />;
  }
  if (mode === "created" || mode === "attach") {
    return <MilestoneAttachmentStep options={options} onCancel={onCancel} />;
  }
  if (mode === "fix") {
    return <MilestoneReconcileStep options={options} onCancel={onCancel} />;
  }
  if (_isMilestoneReadOnly({ detail, mode })) {
    return <MilestoneReadOnly onCancel={onCancel} />;
  }
  if (mode === "delete") {
    return (
      <MilestoneDeleteDialog
        detail={detail}
        memberId={memberId}
        onDeleted={onDeleted}
        onCancel={onCancel}
      />
    );
  }
  if (mode === "empty") {
    return (
      <MilestoneEmptyStep
        detail={detail}
        onNavigate={onNavigate}
        onCancel={onCancel}
      />
    );
  }
  return <MilestoneSavedStep detail={detail} mode={mode} onCancel={onCancel} />;
}
