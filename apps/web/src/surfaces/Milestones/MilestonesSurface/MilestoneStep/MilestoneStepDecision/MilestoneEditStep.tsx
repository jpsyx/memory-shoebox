import type { ReactNode } from "react";
import { MilestoneForm } from "../../../MilestoneForm/MilestoneForm";
import type { Props as OwnerProps } from "../MilestoneStep";
type Props = { options: OwnerProps; onCancel: () => void };
/** Presents milestone edit step. */
export function MilestoneEditStep({
  options,
  onCancel,
}: Readonly<
  Omit<Props, "options"> & { options: Readonly<OwnerProps> }
>): ReactNode {
  return (
    <MilestoneForm
      detail={options.detail}
      memberId={options.memberId}
      hasUsableAuthority={options.hasUsableAuthority}
      onSaved={options.onSaved}
      onCancel={onCancel}
    />
  );
}
