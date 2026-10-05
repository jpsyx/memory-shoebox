import { Table } from "@mantine/core";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { memberDate, ROLE_WORD } from "@/surfaces/Members/memberCopy";
import { MemberActions } from "@/surfaces/Members/MembersSurface/MemberActions";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";

type Props = {
  member: AdminMemberDto;
  timezone: string;
  onAction: (action: MemberAction) => void;
};
/** One directory identity with factual invitation and last-seen status. */
export function MemberRow({
  member,
  timezone,
  onAction,
}: Readonly<Props>): ReactNode {
  const invitationState =
    member.status === "invited"
      ? member.invitation?.isPending
        ? "Invitation pending"
        : "Invitation expired"
      : memberDate({ timestamp: member.lastSeenAt, timezone });
  return (
    <Table.Tr>
      <Table.Td data-label="Person">
        <b>{member.displayName}</b>
        <br />
        <span>{member.email}</span>
      </Table.Td>
      <Table.Td data-label="Role">{ROLE_WORD[member.role]}</Table.Td>
      <Table.Td data-label="Last seen">{invitationState}</Table.Td>
      <Table.Td data-label="Actions">
        <MemberActions member={member} onAction={onAction} />
      </Table.Td>
    </Table.Tr>
  );
}
