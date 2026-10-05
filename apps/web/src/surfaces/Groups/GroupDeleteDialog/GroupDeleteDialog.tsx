import { Modal } from "@mantine/core";
import type { AdminGroupDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { useGroupDeletion } from "@/surfaces/Groups/GroupDeleteDialog/useGroupDeletion";
import { GroupDeleteBody } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteBody";
/** Protected confirmation cannot execute without a successful usage read. */
export function GroupDeleteDialog({
  group,
  onClose,
}: Readonly<{ group: AdminGroupDto; onClose: () => void }>): ReactNode {
  const deletion = useGroupDeletion({ groupId: group.groupId, onClose });
  const isPending = deletion.mutation.isPending;
  const close = () => {
    if (!isPending) onClose();
  };
  return (
    <Modal
      opened
      title={`Delete ${deletion.usage?.group.name ?? group.name}?`}
      onClose={close}
      returnFocus={false}
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
      withCloseButton={!isPending}
    >
      <GroupDeleteBody deletion={deletion} onClose={close} />
    </Modal>
  );
}
