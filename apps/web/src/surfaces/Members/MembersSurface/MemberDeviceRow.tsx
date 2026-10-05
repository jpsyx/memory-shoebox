import { useMemberContinuationGate } from "@/surfaces/Members/useMemberContinuationGate";
import { Button, Table } from "@mantine/core";
import type { AdminMemberDto, SessionDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopy";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";

type Props = {
  member: AdminMemberDto;
  session: SessionDto;
  timezone: string;
  onAction: (action: MemberAction) => void;
};
/** Names both device and owner, including the administrator's current device. */
export function MemberDeviceRow({
  member,
  session,
  timezone,
  onAction,
}: Readonly<Props>): ReactNode {
  const isBlocked = useMemberContinuationGate().hasCommitted;
  return (
    <Table.Tr>
      <Table.Td data-label="Person">{member.displayName}</Table.Td>
      <Table.Td data-label="Device">
        {session.deviceLabel}
        {session.isCurrent ? " · this one" : ""}
      </Table.Td>
      <Table.Td data-label="Last used">
        {memberDate({ timestamp: session.lastUsedAt, timezone })}
      </Table.Td>
      <Table.Td data-label="Actions">
        <Button
          disabled={isBlocked}
          variant="default"
          size="sm"
          aria-label={`Sign out ${session.deviceLabel} for ${member.displayName}`}
          onClick={() => {
            return onAction({ kind: "device", member, session });
          }}
        >
          Sign it out
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}
