import { PresenceMetric } from "./PresenceMetric/PresenceMetric";
import { Table } from "@mantine/core";
import type { PresenceRow } from "@memory-shoebox/shared";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopyHelpers";
import { PresenceMemberIdentity } from "../PresenceMemberIdentity/PresenceMemberIdentity";
import classes from "./PresenceMemberRow.module.css";
type Props = { row: PresenceRow; timezone: string };

/** Distinguishes invitations, first arrival, code sign-in and recorded use. */
export function PresenceMemberRow({
  row,
  timezone,
}: Readonly<Props>): ReactNode {
  const metrics = [
    ["Days active", row.activeDaysCount],
    ["Opened", row.itemsOpenedCount],
    ["Comments", row.commentsWrittenCount],
    ["Reactions", row.reactionsLeftCount],
  ] as const;
  return (
    <Table.Tr
      className={clsx(
        row.lastSignedInAt === null && classes.presenceMemberRowAbsent,
      )}
    >
      <PresenceMemberIdentity row={row} timezone={timezone} />
      <Table.Td data-label="Last signed in">
        {row.lastSignedInAt === null
          ? "Never signed in"
          : memberDate({ timestamp: row.lastSignedInAt, timezone })}
        <div className={classes.presenceMemberRowQuiet}>
          Last seen:{" "}
          {row.lastSeenAt === null
            ? "No use recorded"
            : memberDate({ timestamp: row.lastSeenAt, timezone })}
        </div>
      </Table.Td>
      {metrics.map(([label, metricCount]) => {
        return (
          <PresenceMetric
            key={label}
            label={label}
            metricCount={metricCount}
            activeDaysWindowDays={row.activeDaysWindowDays}
          />
        );
      })}
    </Table.Tr>
  );
}
