import { Button, Table } from "@mantine/core";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import {
  daysLeftLabel,
  lastUsedLabel,
} from "@/surfaces/Account/deviceLabels/deviceLabels";
import classes from "@/system/system.module.css";

/** Props for one row: its session, the clock to label it from, and the callback. */
type Props = {
  session: SessionDto;
  now: Date;
  onSignOut: (device: SessionDto) => void;
};

/**
 * One device: its label (and "· this one" when it is the one you are on),
 * the two timestamps as labels, and the button that starts sign-out.
 *
 * Every button carries the device's own name, because a list of controls that
 * all announce "Sign out" reads to a screen reader as several identical
 * controls with no way to tell which is which.
 */
export function DeviceRow({
  session,
  now,
  onSignOut,
}: Readonly<Props>): ReactNode {
  return (
    <Table.Tr>
      <Table.Td data-label="Device">
        <b>{session.deviceLabel}</b>
        {session.isCurrent ? " · this one" : ""}
      </Table.Td>
      <Table.Td data-label="Last used" className={classes.tabular}>
        {lastUsedLabel({ lastUsedAt: session.lastUsedAt, now })}
      </Table.Td>
      <Table.Td data-label="Stays until" className={classes.tabular}>
        {daysLeftLabel({ expiresAt: session.expiresAt, now })}
      </Table.Td>
      <Table.Td data-label="Action">
        <Button
          variant={session.isCurrent ? "danger" : "default"}
          size="sm"
          aria-label={
            session.isCurrent
              ? "Sign out here"
              : `Sign out ${session.deviceLabel}`
          }
          onClick={() => {
            onSignOut(session);
          }}
        >
          {session.isCurrent ? "Sign out here" : "Sign out"}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}
