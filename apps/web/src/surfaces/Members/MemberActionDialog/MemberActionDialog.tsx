import { Modal, Stack } from "@mantine/core";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberActionBody } from "@/surfaces/Members/MemberActionDialog/MemberActionBody";
import { useMemberConfirmation } from "@/surfaces/Members/MemberActionDialog/useMemberConfirmation";
import { memberConfirmationTitle } from "@/surfaces/Members/MemberActionDialog/memberConfirmationCopyHelpers";
import { MemberConfirmationNotice } from "@/surfaces/Members/MemberActionDialog/MemberConfirmationNotice";
import { MemberConfirmationControls } from "@/surfaces/Members/MemberActionDialog/MemberConfirmationControls";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";

type Props = {
  action: Exclude<MemberAction, { kind: "invite" }>;
  members: readonly AdminMemberDto[];
  onClose: () => void;
};
/** Protected-focus dialog whose owner restores the original action trigger. */
export function MemberActionDialog({
  action,
  members,
  onClose,
}: Readonly<Props>): ReactNode {
  const confirmation = useMemberConfirmation({ action, members, onClose });
  return (
    <Modal
      opened
      onClose={confirmation.onClose}
      title={memberConfirmationTitle(action)}
      returnFocus={false}
      closeOnClickOutside={!confirmation.isPending}
      closeOnEscape={!confirmation.isPending}
      withCloseButton={!confirmation.isPending}
    >
      <Stack gap="md">
        <MemberActionBody
          action={action}
          role={confirmation.role}
          onRole={confirmation.onRole}
          isPending={confirmation.isPending}
          error={confirmation.fieldError}
        />
        <MemberConfirmationNotice
          isProtected={confirmation.isProtected}
          failure={confirmation.failure}
        />
        <MemberConfirmationControls
          action={action}
          confirmation={confirmation}
        />
      </Stack>
    </Modal>
  );
}
