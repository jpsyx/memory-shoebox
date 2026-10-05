import { Table, Text } from "@mantine/core";
import type { AdminGroupDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { GroupRow } from "@/surfaces/Groups/GroupsSurface/GroupRow";
import type { GroupSelection } from "@/surfaces/Groups/GroupsSurface/useGroupSelection";
import classes from "@/surfaces/Groups/GroupsSurface/GroupsSurface.module.css";
/** A semantic table reflows to labeled rows on a narrow screen. */
export function GroupsTable({
  groups,
  onAction,
  isDisabled,
}: Readonly<{
  groups: readonly AdminGroupDto[];
  onAction: (action: GroupSelection) => void;
  isDisabled: boolean;
}>): ReactNode {
  return groups.length === 0 ? (
    <Text>No groups yet.</Text>
  ) : (
    <Table className={classes.table}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Group</Table.Th>
          <Table.Th>Who is in it</Table.Th>
          <Table.Th>Used by</Table.Th>
          <Table.Th>
            <span className={classes.srOnly}>Actions</span>
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {groups.map((group) => {
          return (
            <GroupRow
              key={group.groupId}
              group={group}
              onAction={onAction}
              isDisabled={isDisabled}
            />
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
