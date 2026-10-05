import { Button, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMemberReadAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { InviteMemberForm } from "@/surfaces/Members/InviteMemberForm/InviteMemberForm";
import { MemberActionDialog } from "@/surfaces/Members/MemberActionDialog/MemberActionDialog";
import { MemberDevices } from "@/surfaces/Members/MembersSurface/MemberDevices";
import { MemberRoles } from "@/surfaces/Members/MembersSurface/MemberRoles";
import { MembersTable } from "@/surfaces/Members/MembersSurface/MembersTable";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import classes from "@/surfaces/Members/MembersSurface/MembersSurface.module.css";

/** Owns the directory's reads and selection, and preserves input on read faults. */
export function MembersDirectory(): ReactNode {
  const { settings } = useRouteContext({ from: "/_app" });
  const directory = useQuery({ ...adminMembersQueryOptions, retry: false });
  useMemberReadAuthority(directory.error);
  const [isInviting, setIsInviting] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | undefined>();
  const [action, setAction] = useState<MemberAction | undefined>();
  const members =
    directory.data?.shape === "admin" ? directory.data.members : [];
  return (
    <Stack gap="lg">
      <Prose onPanel>
        {members.length} people, by invitation only. An address that has not
        been invited cannot sign in.
      </Prose>
      <Link to="/groups" className={classes.link}>
        Groups
      </Link>
      {sentEmail === undefined ? null : (
        <div role="status">
          <Banner>
            Invitation queued for {sentEmail}. It expires in seven days. They
            appear below until they sign in.
          </Banner>
        </div>
      )}
      {isInviting ? (
        <InviteMemberForm
          onClose={() => {
            return setIsInviting(false);
          }}
          onSent={(email) => {
            setSentEmail(email);
            setIsInviting(false);
          }}
        />
      ) : null}
      <Sheet wide label="Members">
        <SheetHead title={`${members.length} people`}>
          <Button
            disabled={isInviting || directory.data?.shape !== "admin"}
            onClick={() => {
              return setIsInviting(true);
            }}
          >
            Invite somebody
          </Button>
        </SheetHead>
        {directory.isPending ? (
          <p role="status">Reading the member directory…</p>
        ) : null}
        {directory.isError ? (
          <div role="alert">
            <Prose>The member directory could not be read. Try again.</Prose>
            <Button
              variant="default"
              loading={directory.isFetching}
              onClick={() => {
                void directory.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {directory.data?.shape === "directory" ? (
          <Prose>Only an admin can manage members.</Prose>
        ) : null}
        {directory.data?.shape === "admin" ? (
          <MembersTable
            members={members}
            timezone={settings.timezone}
            onAction={setAction}
          />
        ) : null}
      </Sheet>
      {directory.data?.shape === "admin" ? (
        <MemberDevices
          members={members}
          timezone={settings.timezone}
          onAction={setAction}
        />
      ) : null}
      <MemberRoles />
      {action === undefined || action.kind === "invite" ? null : (
        <MemberActionDialog
          key={`${action.kind}:${action.member.memberId}`}
          action={action}
          members={members}
          onClose={() => {
            return setAction(undefined);
          }}
        />
      )}
    </Stack>
  );
}
