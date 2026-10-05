import { Modal } from "@mantine/core";
import type { AdminGroupDto, AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { GroupFormBody } from "@/surfaces/Groups/GroupForm/GroupFormBody";
import { useGroupForm } from "@/surfaces/Groups/GroupForm/useGroupForm";
/** Pending edits retain protected focus and cannot close before the write lands. */
export function GroupEditDialog({
  group,
  members,
  onClose,
}: Readonly<{
  group: AdminGroupDto;
  members: readonly AdminMemberDto[];
  onClose: () => void;
}>): ReactNode {
  const form = useGroupForm({ group, onClose });
  const close = () => {
    if (!form.isBlocked) onClose();
  };
  return (
    <Modal
      opened
      onClose={close}
      title={group.name}
      returnFocus={false}
      closeOnClickOutside={!form.isBlocked}
      closeOnEscape={!form.isBlocked}
      withCloseButton={!form.isBlocked}
    >
      <GroupFormBody
        form={form}
        members={members}
        isCreating={false}
        onClose={close}
      />
    </Modal>
  );
}
