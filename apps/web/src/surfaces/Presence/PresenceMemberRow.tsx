import { Table } from "@mantine/core";
import type { PresenceRow } from "@memory-shoebox/shared";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopy";
import { PresenceMemberIdentity } from "./PresenceMemberIdentity";
import classes from "./Presence.module.css";

/** Distinguishes invitations, first arrival, code sign-in and recorded use. */
export function PresenceMemberRow({
  row,
  timezone,
}: Readonly<{ row: PresenceRow; timezone: string }>): ReactNode {
  const metrics = [
    ["Days active", row.activeDaysCount],
    ["Opened", row.itemsOpenedCount],
    ["Comments", row.commentsWrittenCount],
    ["Reactions", row.reactionsLeftCount],
  ] as const;
  return (
    <Table.Tr
      className={row.lastSignedInAt === null ? classes.absent : undefined}
    >
      <PresenceMemberIdentity row={row} timezone={timezone} />
      <Table.Td data-label="Last signed in">
        {row.lastSignedInAt === null
          ? "Never signed in"
          : memberDate({ timestamp: row.lastSignedInAt, timezone })}
        <div className={classes.quiet}>
          Last seen:{" "}
          {row.lastSeenAt === null
            ? "No use recorded"
            : memberDate({ timestamp: row.lastSeenAt, timezone })}
        </div>
      </Table.Td>
      {metrics.map(([label, count]) => {
        return (
          <Table.Td key={label} data-label={label}>
            <span
              className={clsx(classes.figure, count === 0 && classes.quiet)}
            >
              {count.toLocaleString()}
            </span>
            {label === "Days active" ? (
              <div className={classes.quiet}>
                of {row.activeDaysWindowDays} days
              </div>
            ) : null}
          </Table.Td>
        );
      })}
    </Table.Tr>
  );
}
