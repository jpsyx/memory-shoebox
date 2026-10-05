import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { useGroupDeletion } from "@/surfaces/Groups/GroupDeleteDialog/useGroupDeletion";
type Props = {
  deletion: ReturnType<typeof useGroupDeletion>;
  onClose: () => void;
};

/** Only a successful usage read with valid consent enables confirmation. */
export function GroupDeleteControls({
  deletion,
  onClose,
}: Readonly<Props>): ReactNode {
  return (
    <Group>
      <Button
        variant="danger"
        onClick={deletion.onConfirm}
        disabled={!deletion.canDelete}
      >
        {deletion.mutation.isPending
          ? "Deleting…"
          : deletion.usage?.rules.length
            ? "Delete it anyway"
            : "Delete it"}
      </Button>
      <Button
        variant="default"
        disabled={
          deletion.mutation.isPending ||
          deletion.mutation.reconciliation.hasCommitted
        }
        onClick={onClose}
      >
        Keep it
      </Button>
    </Group>
  );
}
