import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { GroupForm } from "@/surfaces/Groups/GroupForm/GroupForm";
import { GroupEditDialog } from "@/surfaces/Groups/GroupsSurface/GroupEditDialog";
import { GroupDeleteDialog } from "@/surfaces/Groups/GroupDeleteDialog/GroupDeleteDialog";
import { GroupsRecovery } from "@/surfaces/Groups/GroupsSurface/GroupsRecovery";
import { GroupsDirectorySheet } from "@/surfaces/Groups/GroupsSurface/GroupsDirectorySheet";
import { useGroupSelection } from "@/surfaces/Groups/GroupsSurface/useGroupSelection";
import { useGroupsDirectoryReads } from "@/surfaces/Groups/GroupsSurface/useGroupsDirectoryReads";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
/** Administrative read lifecycle feeds inline creation and protected dialogs. */
export function GroupsDirectory(): ReactNode {
  const reads = useGroupsDirectoryReads();
  const selection = useGroupSelection();
  return (
    <div
      ref={selection.directoryRef}
      tabIndex={-1}
      role="region"
      aria-label="Groups directory"
    >
      <Stack gap="lg">
        <GroupsRecovery
          isVisible={!selection.isCreating && selection.selection === undefined}
        />
        {selection.isCreating ? (
          <Sheet wide label="A new group">
            <SheetHead title="A new group" />
            <GroupForm members={reads.members} onClose={selection.onClose} />
          </Sheet>
        ) : null}
        <GroupsDirectorySheet reads={reads} selection={selection} />
        {selection.selection?.kind === "edit" ? (
          <GroupEditDialog
            group={selection.selection.group}
            members={reads.members}
            onClose={selection.onClose}
          />
        ) : null}
        {selection.selection?.kind === "delete" ? (
          <GroupDeleteDialog
            group={selection.selection.group}
            onClose={selection.onClose}
          />
        ) : null}
      </Stack>
    </div>
  );
}
