import type {
  ShellSettings,
  AdminMemberDto,
  ListMembersResponse,
} from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { useMemberReadAuthority } from "@/surfaces/Members/useMemberReadAuthority";
import { useMemberSelection } from "./useMemberSelection";
import { useMembersInvitation } from "./useMembersInvitation";
type MemberDirectoryState = {
  settings: ShellSettings;
  directory: UseQueryResult<ListMembersResponse, Error>;
  invitation: ReturnType<typeof useMembersInvitation>;
  selection: ReturnType<typeof useMemberSelection>;
  members: AdminMemberDto[];
};

/**
 * Read authority and keep invitation and dialog state owned by the directory.
 */
export function useMemberDirectoryState(): MemberDirectoryState {
  const { settings } = useRouteContext({ from: "/_app" });
  const directory = useQuery({ ...adminMembersQueryOptions, retry: false });
  useMemberReadAuthority(directory.error ?? undefined);
  const invitation = useMembersInvitation();
  const selection = useMemberSelection();
  const members =
    directory.data?.shape === "admin" ? directory.data.members : [];
  return { settings, directory, invitation, selection, members };
}
