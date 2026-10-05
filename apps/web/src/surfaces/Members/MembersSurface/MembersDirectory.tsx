import { useMemberDirectoryState } from "./useMemberDirectoryState";
import { MemberRecovery } from "@/surfaces/Members/MemberRecovery";
import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { MemberActionDialog } from "@/surfaces/Members/MemberActionDialog/MemberActionDialog";
import { MemberDevices } from "@/surfaces/Members/MembersSurface/MemberDevices";
import { MemberRoles } from "@/surfaces/Members/MembersSurface/MemberRoles";
import { MembersIntroduction } from "@/surfaces/Members/MembersSurface/MembersIntroduction";
import { MembersInvitation } from "@/surfaces/Members/MembersSurface/MembersInvitation";
import { MembersDirectorySheet } from "@/surfaces/Members/MembersSurface/MembersDirectorySheet";

/** Composes directory reads, inline invitations and protected confirmations. */
export function MembersDirectory(): ReactNode {
  const { settings, directory, invitation, selection, members } =
    useMemberDirectoryState();
  return (
    <Stack
      gap="lg"
      ref={selection.directoryRef}
      tabIndex={-1}
      role="region"
      aria-label="Member administration"
    >
      <MembersIntroduction memberCount={members.length} />
      <MemberRecovery />
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
