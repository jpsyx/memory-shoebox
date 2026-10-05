import { Table } from "@mantine/core";
import type { AdminMemberDto, SessionDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberDeviceRow } from "@/surfaces/Members/MembersSurface/MemberDeviceRow";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import classes from "./MemberDevicesTable.module.css";

type Props = {
  devices: ReadonlyArray<{ member: AdminMemberDto; session: SessionDto }>;
  timezone: string;
  onAction: (action: MemberAction) => void;
};
/** The all-members device table shares the directory's labeled narrow rows. */
export function MemberDevicesTable({
  devices,
  timezone,
  onAction,
}: Readonly<Props>): ReactNode {
  return (
    <Table
      aria-label="Every signed-in device"
      className={classes.memberDevicesTableTable}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Person</Table.Th>
          <Table.Th>Device</Table.Th>
          <Table.Th>Last used</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {devices.map(({ member, session }) => {
          return (
            <MemberDeviceRow
              key={session.sessionId}
              member={member}
              session={session}
              timezone={timezone}
              onAction={onAction}
            />
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
