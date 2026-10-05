import { Group, Table, Text } from "@mantine/core";
import type { AdminGroupDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { GroupRowActions } from "@/surfaces/Groups/GroupsSurface/GroupRowActions";
import { Chip } from "@/system/Chip/Chip";
import type { GroupSelection } from "@/surfaces/Groups/GroupsSurface/useGroupSelection";
type Props = {
  group: AdminGroupDto;
  onAction: (action: GroupSelection) => void;
  isDisabled: boolean;
};
/** One administrative row keeps the Only and Except counts distinct. */
export function GroupRow({
  group,
  onAction,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <Table.Tr>
      <Table.Td data-label="Group">
        <strong>{group.name}</strong>
      </Table.Td>
      <Table.Td data-label="Who is in it">
        <Group gap="xs">
          {group.members.map((member) => {
            return <Chip key={member.memberId}>{member.displayName}</Chip>;
          })}
        </Group>
        {group.members.length === 0 ? (
          <Text c="var(--on-print-quiet)">Nobody yet</Text>
        ) : null}
      </Table.Td>
      <Table.Td data-label="Used by">
        {group.usedByOnlyRules + group.usedByExceptRules === 0 ? (
          "Nothing yet"
        ) : (
          <>
            <Text>{itemRuleUsage(group.usedByOnlyRules, "Only")}</Text>
            <Text>{itemRuleUsage(group.usedByExceptRules, "Except")}</Text>
          </>
        )}
      </Table.Td>
      <Table.Td data-label="Actions">
        <GroupRowActions
          group={group}
          onAction={onAction}
          isDisabled={isDisabled}
        />
      </Table.Td>
    </Table.Tr>
  );
}

function itemRuleUsage(count: number, mode: "Only" | "Except"): string {
  return `${count} ${count === 1 ? "item" : "items"} in ${mode} rules`;
}
