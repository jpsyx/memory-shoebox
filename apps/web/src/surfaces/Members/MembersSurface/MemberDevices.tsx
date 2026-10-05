import { Stack, Table } from "@mantine/core";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberDeviceRow } from "@/surfaces/Members/MembersSurface/MemberDeviceRow";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import classes from "@/surfaces/Members/MembersSurface/MembersSurface.module.css";

type Props = {
  members: readonly AdminMemberDto[];
  timezone: string;
  onAction: (action: MemberAction) => void;
};
/** All live administrative device facts, from the directory response. */
export function MemberDevices({
  members,
  timezone,
  onAction,
}: Readonly<Props>): ReactNode {
  const devices = members.flatMap((member) => {
    return member.sessions.map((session) => {
      return { member, session };
    });
  });
  return (
    <Sheet wide label="Every signed-in device">
      <SheetHead title="Every signed-in device" />
      <Stack gap="md">
        <Prose>
          Every device currently holding a session, for everybody. Signing one
          out stops it immediately, which is what a lost phone in the family
          needs.
        </Prose>
        {devices.length === 0 ? (
          <Prose>No signed-in devices were returned.</Prose>
        ) : (
          <Table aria-label="Every signed-in device" className={classes.table}>
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
        )}
      </Stack>
    </Sheet>
  );
}
