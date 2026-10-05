import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { useGroupDeletion } from "@/surfaces/Groups/GroupDeleteDialog/useGroupDeletion";
/** Only a successful usage read with valid consent enables confirmation. */
export function GroupDeleteControls({
  deletion,
  onClose,
}: Readonly<{
  deletion: ReturnType<typeof useGroupDeletion>;
  onClose: () => void;
}>): ReactNode {
  return (
    <Group>
      <Button
        variant="quiet"
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
        variant="quiet"
        disabled={deletion.mutation.isPending}
        onClick={onClose}
      >
        Keep it
      </Button>
    </Group>
  );
}
