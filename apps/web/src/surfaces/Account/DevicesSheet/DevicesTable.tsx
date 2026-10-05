import classes from "@/surfaces/Account/DevicesSheet/DevicesTable.module.css";
import { Table } from "@mantine/core";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import { DeviceRow } from "@/surfaces/Account/DevicesSheet/DeviceRow";

/** Props for the table: every session, the clock, and the sign-out callback. */
type Props = {
  sessions: readonly SessionDto[];
  now: Date;
  onSignOut: (device: SessionDto) => void;
};

/** Device facts reflow into labelled rows on narrow screens. */
export function DevicesTable({
  sessions,
  now,
  onSignOut,
}: Readonly<Props>): ReactNode {
  return (
    <Table aria-label="Where you are signed in" className={classes.table}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Device</Table.Th>
          <Table.Th>Last used</Table.Th>
          <Table.Th>Stays until</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sessions.map((session) => {
          return (
            <DeviceRow
              key={session.sessionId}
              session={session}
              now={now}
              onSignOut={onSignOut}
            />
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
