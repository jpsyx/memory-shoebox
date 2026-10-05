import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import type { MemberConfirmationState } from "@/surfaces/Members/MemberActionDialog/useMemberConfirmation";
import { memberConfirmationButton } from "@/surfaces/Members/MemberActionDialog/memberConfirmationCopy";
import { ChipRow } from "@/system/Chip/ChipRow";

type Props = {
  action: Exclude<MemberAction, { kind: "invite" }>;
  confirmation: MemberConfirmationState;
};
/** Confirmations preserve disabled safeguards and pending cancellation locks. */
export function MemberConfirmationControls({
  action,
  confirmation,
}: Readonly<Props>): ReactNode {
  return (
    <ChipRow>
      <Button
        variant={action.kind === "role" ? "filled" : "danger"}
        disabled={confirmation.isProtected}
        loading={confirmation.isPending}
        onClick={confirmation.onConfirm}
      >
        {memberConfirmationButton(action)}
      </Button>
      <Button
        variant="default"
        disabled={confirmation.isPending}
        onClick={confirmation.onClose}
      >
        Cancel
      </Button>
    </ChipRow>
  );
}
