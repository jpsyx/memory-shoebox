import { Button } from "@mantine/core";
import type { ListMembersResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MembersTable } from "@/surfaces/Members/MembersSurface/MembersTable";
import { MembersReadState } from "@/surfaces/Members/MembersSurface/MembersReadState";
import type { MembersInvitationState } from "@/surfaces/Members/MembersSurface/useMembersInvitation";
import type { MemberSelection } from "@/surfaces/Members/MembersSurface/useMemberSelection";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";

type Props = {
  directory: UseQueryResult<ListMembersResponse, Error>;
  invitation: MembersInvitationState;
  selection: MemberSelection;
  timezone: string;
};
/** The directory panel owns its read state, member rows and invitation entry. */
export function MembersDirectorySheet({
  directory,
  invitation,
  selection,
  timezone,
}: Readonly<Props>): ReactNode {
  const members =
    directory.data?.shape === "admin" ? directory.data.members : [];
  return (
    <Sheet wide label="Members">
      <SheetHead title={`${members.length} people`}>
        <Button
          disabled={invitation.isInviting || directory.data?.shape !== "admin"}
          onClick={invitation.onOpen}
        >
          Invite somebody
        </Button>
      </SheetHead>
      <MembersReadState directory={directory} />
      {directory.data?.shape === "admin" ? (
        <MembersTable
          members={members}
          timezone={timezone}
          onAction={selection.onAction}
        />
      ) : null}
    </Sheet>
  );
}
