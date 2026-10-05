import { Table } from "@mantine/core";
import type { PresenceRow } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopyHelpers";
import classes from "./PresenceMemberIdentity.module.css";
type Props = { row: PresenceRow; timezone: string };

/** An invitation and first arrival are different from later sign-ins. */
export function PresenceMemberIdentity({
  row,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <Table.Td data-label="Member">
      <b>{row.member.displayName}</b>
      <div>{row.email}</div>
      <div className={classes.presenceMemberIdentityQuiet}>
        {row.joinedAt === null
          ? "Not joined yet"
          : `Joined ${memberDate({ timestamp: row.joinedAt, timezone })}`}
      </div>
      <div className={classes.presenceMemberIdentityQuiet}>
        Invited {memberDate({ timestamp: row.invitedAt, timezone })}
      </div>
    </Table.Td>
  );
}
