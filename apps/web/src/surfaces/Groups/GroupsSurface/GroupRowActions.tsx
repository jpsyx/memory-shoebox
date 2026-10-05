import { Button, Group } from "@mantine/core";
import type { AdminGroupDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { GroupSelection } from "@/surfaces/Groups/GroupsSurface/useGroupSelection";
/** Row actions identify their group to assistive technology. */
export function GroupRowActions({
  group,
  onAction,
  isDisabled,
}: Readonly<{
  group: AdminGroupDto;
  onAction: (action: GroupSelection) => void;
  isDisabled: boolean;
}>): ReactNode {
  return (
    <Group gap="xs">
      <Button
        variant="quiet"
        disabled={isDisabled}
        aria-label={`Edit ${group.name}`}
        onClick={() => {
          return onAction({ kind: "edit", group });
        }}
      >
        Edit
      </Button>
      <Button
        variant="quiet"
        disabled={isDisabled}
        aria-label={`Delete ${group.name}`}
        onClick={() => {
          return onAction({ kind: "delete", group });
        }}
      >
        Delete
      </Button>
    </Group>
  );
}
