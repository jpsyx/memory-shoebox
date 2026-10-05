import { Table } from "@mantine/core";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberRow } from "@/surfaces/Members/MembersSurface/MemberRow";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import classes from "@/surfaces/Members/MembersSurface/MembersSurface.module.css";

type Props = {
  members: readonly AdminMemberDto[];
  timezone: string;
  onAction: (action: MemberAction) => void;
};
/** Desktop columns become labeled member rows at narrow widths. */
export function MembersTable({
  members,
  timezone,
  onAction,
}: Readonly<Props>): ReactNode {
  return (
    <Table aria-label="Members" className={classes.table}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Person</Table.Th>
          <Table.Th>Role</Table.Th>
          <Table.Th>Last seen</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {members.map((member) => {
          return (
            <MemberRow
              key={member.memberId}
              member={member}
              timezone={timezone}
              onAction={onAction}
            />
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
