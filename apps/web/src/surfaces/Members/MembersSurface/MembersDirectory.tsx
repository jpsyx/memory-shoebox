import { Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { useMemberReadAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import { MemberActionDialog } from "@/surfaces/Members/MemberActionDialog/MemberActionDialog";
import { MemberDevices } from "@/surfaces/Members/MembersSurface/MemberDevices";
import { MemberRoles } from "@/surfaces/Members/MembersSurface/MemberRoles";
import { MembersIntroduction } from "@/surfaces/Members/MembersSurface/MembersIntroduction";
import { MembersInvitation } from "@/surfaces/Members/MembersSurface/MembersInvitation";
import { MembersDirectorySheet } from "@/surfaces/Members/MembersSurface/MembersDirectorySheet";
import { useMemberSelection } from "@/surfaces/Members/MembersSurface/useMemberSelection";
import { useMembersInvitation } from "@/surfaces/Members/MembersSurface/useMembersInvitation";

/** Composes directory reads, inline invitations and protected confirmations. */
export function MembersDirectory(): ReactNode {
  const { settings } = useRouteContext({ from: "/_app" });
  const directory = useQuery({ ...adminMembersQueryOptions, retry: false });
  useMemberReadAuthority(directory.error);
  const invitation = useMembersInvitation();
  const selection = useMemberSelection();
  const members =
    directory.data?.shape === "admin" ? directory.data.members : [];
  return (
    <Stack
      gap="lg"
      ref={selection.directoryRef}
      tabIndex={-1}
      role="region"
      aria-label="Member administration"
    >
      <MembersIntroduction memberCount={members.length} />
      <MembersInvitation invitation={invitation} />
      <MembersDirectorySheet
        directory={directory}
        invitation={invitation}
        selection={selection}
        timezone={settings.timezone}
      />
      {directory.data?.shape === "admin" ? (
        <MemberDevices
          members={members}
          timezone={settings.timezone}
          onAction={selection.onAction}
        />
      ) : null}
      <MemberRoles />
      {selection.action === undefined ||
      selection.action.kind === "invite" ? null : (
        <MemberActionDialog
          key={`${selection.action.kind}:${selection.action.member.memberId}`}
          action={selection.action}
          members={members}
          onClose={selection.onClose}
        />
      )}
    </Stack>
  );
}
