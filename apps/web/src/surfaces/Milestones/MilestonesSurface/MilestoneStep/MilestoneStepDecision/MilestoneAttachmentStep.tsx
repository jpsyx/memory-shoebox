import type { ReactNode } from "react";
import { MilestoneAttach } from "../../../MilestoneAttach/MilestoneAttach";
import { MilestoneCandidates } from "../../../MilestoneCandidates/MilestoneCandidates";
import type { Props as OwnerProps } from "../MilestoneStep";
type Props = { options: OwnerProps; onCancel: () => void };
/** Presents milestone attachment step. */
export function MilestoneAttachmentStep({
  options,
  onCancel,
}: Readonly<
  Omit<Props, "options"> & { options: Readonly<OwnerProps> }
>): ReactNode {
  const Picker =
    options.mode === "created" ? MilestoneCandidates : MilestoneAttach;
  return (
    <Picker
      detail={options.detail}
      viewer={options.viewer}
      hasUsableAuthority={options.hasUsableAuthority}
      onDone={onCancel}
      onFix={(savedDetail) => {
        options.onNavigate({
          milestone: savedDetail.milestone.milestoneId,
          mode: "fix",
        });
      }}
    />
  );
}
