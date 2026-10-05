import { Table } from "@mantine/core";
import type { PresenceRow } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { PresenceMemberRow } from "./PresenceMemberRow";
import classes from "./Presence.module.css";

/** Labeled fields reflow at phone and tablet widths without horizontal scrolling. */
export function PresenceTable(
  options: Readonly<{ rows: readonly PresenceRow[]; timezone: string }>,
): ReactNode {
  return (
    <Table className={classes.table}>
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
        {options.rows.map((row) => {
          return (
            <PresenceMemberRow
              key={row.member.memberId}
              row={row}
              timezone={options.timezone}
            />
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
