import { Table } from "@mantine/core";
import type { PresenceRow } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { PresenceMemberRow } from "../PresenceMemberRow/PresenceMemberRow";
import classes from "./PresenceTable.module.css";
type Props = { rows: readonly PresenceRow[]; timezone: string };

/**
 * Labeled fields reflow at phone and tablet widths without horizontal
 * scrolling.
 */
export function PresenceTable({ rows, timezone }: Readonly<Props>): ReactNode {
  return (
    <Table className={classes.presenceTableTable}>
      <Table.Thead>
        <Table.Tr>
          {[
            "Member",
            "Last signed in",
            "Days active",
            "Opened",
            "Comments",
            "Reactions",
          ].map((label) => {
            return <Table.Th key={label}>{label}</Table.Th>;
          })}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => {
          return (
            <PresenceMemberRow
              key={row.member.memberId}
              row={row}
              timezone={timezone}
            />
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
