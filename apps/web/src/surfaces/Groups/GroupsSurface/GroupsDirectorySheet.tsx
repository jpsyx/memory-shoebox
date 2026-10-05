import { IconPlus } from "@tabler/icons-react";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { GroupsDirectoryReads } from "@/surfaces/Groups/GroupsSurface/useGroupsDirectoryReads";
import type { GroupSelectionState } from "@/surfaces/Groups/GroupsSurface/useGroupSelection";
import { GroupsReadState } from "@/surfaces/Groups/GroupsSurface/GroupsReadState";
import { GroupsTable } from "@/surfaces/Groups/GroupsSurface/GroupsTable/GroupsTable";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
type Props = {
  reads: GroupsDirectoryReads;
  selection: GroupSelectionState;
};

/** Directory sheet keeps read recovery separate from creation and editing. */
export function GroupsDirectorySheet({
  reads,
  selection,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="Groups">
      <SheetHead
        title={`${reads.groups.data?.groups.length ?? 0} ${reads.groups.data?.groups.length === 1 ? "group" : "groups"}`}
      >
        <Button
          leftSection={<IconPlus size={18} aria-hidden="true" />}
          onClick={selection.onCreate}
          disabled={!reads.canEdit || selection.isCreating}
        >
          New group
        </Button>
      </SheetHead>
      <GroupsReadState groups={reads.groups} directory={reads.directory} />
      {reads.groups.data === undefined ? null : (
        <GroupsTable
          groups={reads.groups.data.groups}
          isDisabled={!reads.canEdit}
          onAction={(action) => {
            if (reads.canEdit) {
              selection.onAction(action);
            }
          }}
        />
      )}
    </Sheet>
  );
}
