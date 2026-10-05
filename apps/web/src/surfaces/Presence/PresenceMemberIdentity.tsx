import { Table } from "@mantine/core";
import type { PresenceRow } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopy";
import classes from "./Presence.module.css";

/** An invitation and first arrival are different from later sign-ins. */
export function PresenceMemberIdentity({
  row,
  timezone,
}: Readonly<{ row: PresenceRow; timezone: string }>): ReactNode {
  return (
    <Table.Td data-label="Member">
      <b>{row.member.displayName}</b>
      <div>{row.email}</div>
      <div className={classes.quiet}>
        {row.joinedAt === null
          ? "Not joined yet"
          : `Joined ${memberDate({ timestamp: row.joinedAt, timezone })}`}
      </div>
      <div className={classes.quiet}>
        Invited {memberDate({ timestamp: row.invitedAt, timezone })}
      </div>
    </Table.Td>
  );
}
