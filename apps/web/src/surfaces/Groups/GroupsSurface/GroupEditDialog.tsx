import { Modal } from "@mantine/core";
import type { AdminGroupDto, AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { GroupFormBody } from "@/surfaces/Groups/GroupForm/GroupFormBody/GroupFormBody";
import { useGroupForm } from "@/surfaces/Groups/GroupForm/useGroupForm";
type Props = {
  group: AdminGroupDto;
  members: readonly AdminMemberDto[];
  onClose: () => void;
};

/**
 * Pending edits retain protected focus and cannot close before the write lands.
 */
export function GroupEditDialog({
  group,
  members,
  onClose,
}: Readonly<Props>): ReactNode {
  const form = useGroupForm({ group, onClose });
  const close = () => {
    if (!form.isBlocked) {
      onClose();
    }
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
